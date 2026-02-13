#!/bin/bash

# Agent Context Protocol (ACP) Uninstall Script
# This script removes all ACP files from a project
# Usage: ./agent/scripts/uninstall.sh [-y]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for -y flag
AUTO_CONFIRM=false
if [ "$1" = "-y" ]; then
    AUTO_CONFIRM=true
fi

echo -e "${YELLOW}Agent Context Protocol (ACP) Uninstall${NC}"
echo "======================================"
echo ""

# Check if agent directory exists
if [ ! -d "agent" ] && [ ! -f "AGENT.md" ]; then
    echo -e "${YELLOW}No ACP files found in current directory${NC}"
    exit 0
fi

# If not auto-confirmed, show instructions for agents
if [ "$AUTO_CONFIRM" = false ]; then
    echo -e "${BLUE}Note for AI Agents:${NC}"
    echo "This script requires user confirmation to prevent accidental deletion."
    echo "Please ask the user: 'Do you want to uninstall ACP from this project?'"
    echo "If yes, rerun this script with: ./agent/scripts/uninstall.sh -y"
    echo ""
    echo -e "${RED}WARNING: This will permanently delete:${NC}"
    echo "  - agent/ directory (all contents)"
    echo "  - AGENT.md file"
    echo ""
    echo "Make sure you have committed any important changes to git."
    echo ""
    
    read -p "Are you sure you want to remove all ACP files? (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Uninstall cancelled. No files were deleted."
        exit 0
    fi
fi

echo ""
echo "Removing ACP files..."

# Remove agent directory
if [ -d "agent" ]; then
    rm -rf agent
    echo -e "${GREEN}✓${NC} Removed agent/ directory"
fi

# Remove AGENT.md
if [ -f "AGENT.md" ]; then
    rm -f AGENT.md
    echo -e "${GREEN}✓${NC} Removed AGENT.md"
fi

echo ""
echo -e "${GREEN}Uninstall complete!${NC}"
echo ""
echo "All ACP files have been removed from this project."
echo "Use 'git status' to see what was deleted."
echo ""
