# FaceReg

Real-time face detection and recognition dashboard powered by **InsightFace** and **FastAPI**.

## Architecture

```
facereg/
├── index.html          # Main dashboard — webcam feed, stats, bounding boxes
├── targets.html        # Target management — upload/delete reference faces
├── app.js              # Detection loop: captures frames, calls API, renders overlays
├── targets.js          # Upload/delete targets via drag-drop or file picker
├── utils.js            # API URL config & HTML escaping
├── style.css           # Dark-theme UI with responsive layout
└── backendserve/
    ├── main.py         # FastAPI server (detect, targets CRUD, health)
    ├── detector.py     # InsightFace wrapper: detection, embedding, cosine similarity
    ├── requirements.txt
    ├── .env            # Host, port, threshold config
    └── targets/        # Stored reference faces (image + embedding per UUID)
```

## How It Works

1. **Backend** loads InsightFace's `buffalo_l` model on startup.
2. **Frontend** captures webcam frames every ~300ms, sends them as base64 to `POST /detect`.
3. **Backend** decodes the image, runs face detection, extracts embeddings, and compares against stored targets via cosine similarity.
4. **Response** includes face count, bounding boxes, confidence scores, and any target matches.
5. **Frontend** draws bounding boxes (green for unknown, red for matched targets), updates stats, and logs entries.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Root health check |
| GET | `/health` | Server + model status |
| POST | `/detect` | Detect faces in a base64 image (with optional target matching) |
| GET | `/targets` | List all registered target faces |
| POST | `/targets` | Register a new target face (multipart: file + name) |
| DELETE | `/targets/{id}` | Delete a target face |
| GET | `/targets/{id}/image` | Get target's uploaded image |

## Setup

### Backend

```bash
cd backendserve
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
python main.py
```

### Frontend

Open `index.html` in a browser (or serve with any static file server).

The frontend defaults to `http://localhost:8000` for the API. Set `window.API_URL` to override.

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `DET_THRESHOLD` | `0.5` | Default detection confidence threshold |
| `DET_SIZE` | `640` | Detection input size |

## Target Matching

Upload face images via **Target Management** (`targets.html`). Each target stores:
- The uploaded image
- A 512-d embedding vector from InsightFace

During detection, each detected face embedding is compared against all targets. If cosine similarity exceeds the configurable similarity threshold, it's reported as a match.
