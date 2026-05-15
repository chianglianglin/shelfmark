@echo off
setlocal

echo === Shelfmark ===

REM --- Backend: create venv + install deps if missing ---
if not exist "backend\venv\Scripts\python.exe" (
    echo [setup] Creating Python venv...
    pushd backend
    python -m venv venv
    if errorlevel 1 (
        echo [error] Failed to create venv. Is Python 3.10+ installed and on PATH?
        popd
        exit /b 1
    )
    echo [setup] Installing backend dependencies (this may take a minute)...
    call venv\Scripts\activate.bat
    pip install --quiet -r requirements.txt
    if errorlevel 1 (
        echo [error] pip install failed.
        popd
        exit /b 1
    )
    popd
)

REM --- Frontend: npm install if node_modules missing ---
if not exist "frontend\node_modules" (
    echo [setup] Installing frontend dependencies...
    pushd frontend
    call npm install
    if errorlevel 1 (
        echo [error] npm install failed. Is Node.js 18+ installed and on PATH?
        popd
        exit /b 1
    )
    popd
)

echo Starting servers...
start "Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak > nul
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Both windows opened. Close them to stop.
endlocal
