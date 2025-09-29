@echo off
echo Setting up Python virtual environment for Client-Side Tool Agent Backend...

REM Create virtual environment
echo Creating virtual environment...
python -m venv venv

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Setup complete! 
echo.
echo To activate the virtual environment in the future, run:
echo   venv\Scripts\activate.bat
echo.
echo To start the backend server, run:
echo   uvicorn main:app --reload --port 8000
echo.
echo Don't forget to set your GOOGLE_API_KEY environment variable!
echo   set GOOGLE_API_KEY=your-api-key-here
echo.
pause
