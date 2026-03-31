import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add the backend-2 directory to sys.path so we can import the app
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "..", "Hackamined-Sintex", "backend-2")
sys.path.append(BACKEND_DIR)

# Import the actual FastAPI app from the backend project
try:
    from app.main import app as main_app
    app = main_app
except ImportError as e:
    # Fallback/Debug if import fails on Vercel
    app = FastAPI()
    @app.get("/api/health")
    def health():
        return {"status": "error", "message": f"Could not import app: {str(e)}", "path": sys.path}

# Ensure CORS is handled correctly for the Vercel domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
