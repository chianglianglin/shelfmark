@echo off
echo Starting Readwise Reader...

start "Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak > nul
start "Frontend" cmd /k "cd frontend && npm run dev"

echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Both windows opened. Close them to stop.
