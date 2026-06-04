import numpy as np
from insightface.app import FaceAnalysis

# Initialise once at module level — never inside a function
app = FaceAnalysis(name="buffalo_sc", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))


def detect_faces(frame: np.ndarray, threshold: float = 0.5) -> list:
    """
    Run face detection on a BGR numpy array.

    Returns a list of dicts, each with:
      - box: [x, y, width, height] as ints
      - confidence: float rounded to 2 decimal places
      - landmarks: list of 5 [x, y] int pairs
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

        results.append({
            "box": box,
            "confidence": confidence,
            "landmarks": landmarks,
        })

    return results