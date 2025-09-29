#!/bin/bash

echo "Setting up Python virtual environment for Client-Side Tool Agent Backend..."

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
python -m pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "Setup complete!"
echo ""
echo "To activate the virtual environment in the future, run:"
echo "  source venv/bin/activate"
echo ""
echo "To start the backend server, run:"
echo "  uvicorn main:app --reload --port 8000"
echo ""
echo "Don't forget to set your GOOGLE_API_KEY environment variable!"
echo "  export GOOGLE_API_KEY=your-api-key-here"
echo ""
