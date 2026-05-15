#!/usr/bin/env bash
set -e

echo "=== Shelfmark ==="

# --- Backend: create venv + install deps if missing ---
if [ ! -f "backend/venv/bin/python" ] && [ ! -f "backend/venv/Scripts/python.exe" ]; then
    echo "[setup] Creating Python venv..."
    (cd backend && python -m venv venv) || {
        echo "[error] Failed to create venv. Is Python 3.10+ installed and on PATH?"
        exit 1
    }
    echo "[setup] Installing backend dependencies (this may take a minute)..."
    (
        cd backend
        # shellcheck disable=SC1091
        source venv/bin/activate 2>/dev/null || source venv/Scripts/activate
        pip install --quiet -r requirements.txt
    ) || {
        echo "[error] pip install failed."
        exit 1
    }
fi

# --- Frontend: npm install if node_modules missing ---
if [ ! -d "frontend/node_modules" ]; then
    echo "[setup] Installing frontend dependencies..."
    (cd frontend && npm install) || {
        echo "[error] npm install failed. Is Node.js 18+ installed and on PATH?"
        exit 1
    }
fi

echo "Starting servers..."

# Backend
cd backend
# shellcheck disable=SC1091
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate
uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
