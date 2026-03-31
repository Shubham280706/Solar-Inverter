#!/bin/bash

# Configuration
BACKEND_DIR="Hackamined-Sintex/backend-2"
PYTHON_VENV="venv/bin/python"

echo "🚀 Starting Solar Inverter Backend..."

if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ Error: Backend directory not found at $BACKEND_DIR"
    exit 1
fi

cd "$BACKEND_DIR"

if [ ! -f "venv/bin/python" ]; then
    echo "⚠️ Warning: venv not found. Attempting to use system python (not recommended)..."
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "✅ Using virtual environment: $BACKEND_DIR/venv"
    ./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
