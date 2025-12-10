#!/bin/bash
# Teleapps Launcher for macOS
# Double-click this file to start Teleapps

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 Starting Teleapps..."
echo ""

# Check if virtual environment exists
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Setting up...${NC}"
    python3 -m venv "$SCRIPT_DIR/.venv"
    source "$SCRIPT_DIR/.venv/bin/activate"
    pip install -r "$SCRIPT_DIR/requirements.txt"
else
    source "$SCRIPT_DIR/.venv/bin/activate"
fi

# Check if config exists
if [ ! -f "$SCRIPT_DIR/config.env" ] && [ ! -f "$HOME/Documents/teleapps/config.env" ]; then
    echo -e "${YELLOW}No configuration found.${NC}"
    echo "The setup wizard will guide you through configuration."
    echo ""
fi

# Change to src directory and run
cd "$SCRIPT_DIR/src"

# Run the app
echo -e "${GREEN}Opening http://127.0.0.1:8080 in your browser...${NC}"
echo ""

# Wait a moment then open browser
(sleep 2 && open "http://127.0.0.1:8080") &

# Run the server
python -m teleapps.main

# Keep terminal open on error
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}Teleapps exited with an error.${NC}"
    echo "Press any key to close..."
    read -n 1
fi
