@echo off
echo Starting Client-Side Tool Agent Backend...

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo Virtual environment not found! Please run setup.bat first.
    pause
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Check if GOOGLE_API_KEY is set
if "%GOOGLE_API_KEY%"=="" (
    echo Warning: GOOGLE_API_KEY environment variable is not set!
    echo Please set it with: set GOOGLE_API_KEY=your-api-key-here
    echo.
)

REM Start the server
echo Starting FastAPI server on http://localhost:8000...
uvicorn main:app --reload --port 8000
