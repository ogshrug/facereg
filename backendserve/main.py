import base64
import logging
import os
import time
import json
import uuid
import shutil
from contextlib import asynccontextmanager
from typing import List, Optional

import cv2
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

HOST = os.getenv("HOST", "0.0.0.0")
PORT = os.getenv("PORT", "8000")
DET_THRESHOLD = float(os.getenv("DET_THRESHOLD", "0.5"))
DET_SIZE = int(os.getenv("DET_SIZE", "640"))
TARGETS_DIR = os.path.join(os.path.dirname(__file__), "targets")
os.makedirs(TARGETS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("face_detection")

# ---------------------------------------------------------------------------
# Lifespan — load the model once before the first request
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    import detector  # noqa: F401 — triggers module-level model init
    logger.info("InsightFace model loaded")
    yield
    # Nothing to clean up for a CPU ONNX model


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Face Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class FrameData(BaseModel):
    image: str
    threshold: float = 0.5
    similarity_threshold: float = 0.6


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "Face Detection API is running"}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": True}


@app.get("/targets")
def list_targets():
    targets = []
    for target_id in os.listdir(TARGETS_DIR):
        target_path = os.path.join(TARGETS_DIR, target_id)
        if os.path.isdir(target_path):
            info_path = os.path.join(target_path, "info.json")
            if os.path.exists(info_path):
                with open(info_path, "r") as f:
                    info = json.load(f)
                    targets.append(info)
    return targets


@app.get("/targets/{target_id}/image")
def get_target_image(target_id: str):
    image_path = os.path.join(TARGETS_DIR, target_id, "image.jpg")
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Target image not found")
    return FileResponse(image_path)


@app.post("/targets")
async def add_target(name: str = Form(...), file: UploadFile = File(...)):
    try:
        contents = await file.read()
        np_arr = np.frombuffer(contents, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Failed to decode image")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}")

    import detector as det_module
    # Use a high threshold for target registration to ensure quality
    faces = det_module.detect_faces(frame, threshold=0.6, return_embeddings=True)

    if len(faces) == 0:
        raise HTTPException(status_code=400, detail="No face detected in the image")
    if len(faces) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces detected. Please upload an image with exactly one face.")

    target_id = str(uuid.uuid4())
    target_path = os.path.join(TARGETS_DIR, target_id)
    os.makedirs(target_path, exist_ok=True)

    # Save image
    cv2.imwrite(os.path.join(target_path, "image.jpg"), frame)

    # Save embedding and info
    face = faces[0]
    info = {
        "id": target_id,
        "name": name,
        "embedding": face["embedding"]
    }
    with open(os.path.join(target_path, "info.json"), "w") as f:
        json.dump(info, f)

    return {"status": "success", "id": target_id, "name": name}


@app.delete("/targets/{target_id}")
def delete_target(target_id: str):
    target_path = os.path.join(TARGETS_DIR, target_id)
    if os.path.exists(target_path):
        shutil.rmtree(target_path)
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="Target not found")


@app.post("/detect")
def detect(data: FrameData):
    # --- Decode base64 image ---
    try:
        image_bytes = base64.b64decode(data.image)
        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as exc:
        logger.error("Image decoding failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")

    # --- Run detection ---
    try:
        import detector as det_module

        threshold = data.threshold
        sim_threshold = data.similarity_threshold
        t_start = time.perf_counter()

        # We need embeddings to compare with targets
        faces = det_module.detect_faces(frame, threshold=threshold, return_embeddings=True)

        # Load targets for matching
        targets = list_targets()

        for face in faces:
            face["match"] = None
            if not targets:
                continue

            best_match = None
            max_sim = -1.0

            face_emb = np.array(face["embedding"])

            for target in targets:
                target_emb = np.array(target["embedding"])
                sim = det_module.compute_similarity(face_emb, target_emb)
                if sim > sim_threshold and sim > max_sim:
                    max_sim = sim
                    best_match = {
                        "id": target["id"],
                        "name": target["name"],
                        "similarity": round(sim, 2)
                    }

            face["match"] = best_match
            # Remove embedding from response to save bandwidth
            if "embedding" in face:
                del face["embedding"]

        elapsed_ms = (time.perf_counter() - t_start) * 1000

        logger.info(
            "POST /detect | threshold=%.2f | sim_threshold=%.2f | faces_found=%d | time=%.1f ms",
            threshold,
            sim_threshold,
            len(faces),
            elapsed_ms,
        )

        if elapsed_ms > 500:
            logger.warning(
                "Processing time %.1f ms exceeded 500 ms threshold", elapsed_ms
            )

        return {
            "count": len(faces),
            "processing_time_ms": round(elapsed_ms, 2),
            "faces": faces,
        }

    except Exception as exc:
        logger.error("Detection failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "Detection failed", "detail": str(exc)},
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=int(PORT), reload=True)