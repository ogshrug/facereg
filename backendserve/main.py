import base64
import logging
import os
import time
from contextlib import asynccontextmanager

import cv2
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

HOST = os.getenv("HOST", "0.0.0.0")
PORT = os.getenv("PORT", "8000")
DET_THRESHOLD = float(os.getenv("DET_THRESHOLD", "0.5"))
DET_SIZE = int(os.getenv("DET_SIZE", "640"))

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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "Face Detection API is running"}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": True}


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
        t_start = time.perf_counter()
        faces = det_module.detect_faces(frame, threshold=threshold)
        elapsed_ms = (time.perf_counter() - t_start) * 1000

        logger.info(
            "POST /detect | threshold=%.2f | faces_found=%d | time=%.1f ms",
            threshold,
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