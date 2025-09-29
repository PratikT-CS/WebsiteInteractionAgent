#!/bin/bash

echo "Starting Client-Side Tool Agent Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found! Please run setup.sh first."
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Check if GOOGLE_API_KEY is set
if [ -z "$GOOGLE_API_KEY" ]; then
    echo "Warning: GOOGLE_API_KEY environment variable is not set!"
    echo "Please set it with: export GOOGLE_API_KEY=your-api-key-here"
    echo ""
fi

# Start the server
echo "Starting FastAPI server on http://localhost:8000..."
uvicorn main:app --reload --port 8000
