import numpy as np
from insightface.app import FaceAnalysis

# Initialise once at module level — never inside a function
app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))


def detect_faces(frame: np.ndarray, threshold: float = 0.5, return_embeddings: bool = False) -> list:
    """
    Run face detection on a BGR numpy array.

    Returns a list of dicts, each with:
      - box: [x, y, width, height] as ints
      - confidence: float rounded to 2 decimal places
      - landmarks: list of 5 [x, y] int pairs
      - embedding: list of floats (optional)
    """
    faces = app.get(frame)

    results = []
    for face in faces:
        if face.det_score < threshold:
            continue

        # bbox is [x1, y1, x2, y2] — convert to [x, y, w, h]
        x1, y1, x2, y2 = face.bbox.astype(int)
        box = [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]

        confidence = round(float(face.det_score), 2)

        # kps shape: (5, 2) — convert to list of [x, y] int pairs
        landmarks = [[int(pt[0]), int(pt[1])] for pt in face.kps]

        res = {
            "box": box,
            "confidence": confidence,
            "landmarks": landmarks,
        }

        if return_embeddings and hasattr(face, 'normed_embedding'):
            res["embedding"] = face.normed_embedding.tolist()
        elif return_embeddings and hasattr(face, 'embedding'):
            # Fallback to non-normed if normed is not available
            emb = face.embedding
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            res["embedding"] = emb.tolist()

        results.append(res)

    return results


def compute_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
    """Compute cosine similarity between two embeddings."""
    return float(np.dot(feat1, feat2) / (np.linalg.norm(feat1) * np.linalg.norm(feat2)))