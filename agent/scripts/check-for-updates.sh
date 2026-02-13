#!/bin/bash

# Agent Context Protocol (ACP) Update Checker
# This script checks if updates are available for AGENT.md

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Repository URL
REPO_URL="https://raw.githubusercontent.com/prmichaelsen/agent-context-protocol/mainline"
AGENT_MD_URL="$REPO_URL/AGENT.md"
CHANGELOG_URL="$REPO_URL/CHANGELOG.md"

# Silent mode (no output, just exit codes)
SILENT=false
if [ "$1" = "--silent" ] || [ "$1" = "-s" ]; then
    SILENT=true
fi

# Check if AGENT.md exists
if [ ! -f "AGENT.md" ]; then
    if [ "$SILENT" = false ]; then
        echo -e "${RED}Error: AGENT.md not found in current directory${NC}" >&2
        echo "This script should be run from your project root where AGENT.md is located." >&2
    fi
    exit 2
fi

# Download latest AGENT.md for comparison
if [ "$SILENT" = false ]; then
    echo -e "${BLUE}Checking for updates...${NC}"
fi

if command -v curl &> /dev/null; then
    curl -fsSL "$AGENT_MD_URL" -o /tmp/AGENT.md.latest 2>/dev/null
elif command -v wget &> /dev/null; then
    wget -q "$AGENT_MD_URL" -O /tmp/AGENT.md.latest 2>/dev/null
else
    if [ "$SILENT" = false ]; then
        echo -e "${RED}Error: Neither curl nor wget is available${NC}" >&2
    fi
    exit 2
fi

if [ $? -ne 0 ]; then
    if [ "$SILENT" = false ]; then
        echo -e "${RED}Error: Failed to download latest AGENT.md${NC}" >&2
        echo "Please check your internet connection." >&2
    fi
    rm -f /tmp/AGENT.md.latest
    exit 2
fi

# Compare files
if cmp -s AGENT.md /tmp/AGENT.md.latest; then
    # Files are identical - no updates
    if [ "$SILENT" = false ]; then
        echo -e "${GREEN}✓${NC} Your AGENT.md is up to date!"
    fi
    rm -f /tmp/AGENT.md.latest
    exit 0
else
    # Files differ - updates available
    if [ "$SILENT" = false ]; then
        echo -e "${YELLOW}⚠${NC}  Updates are available for AGENT.md"
        echo ""
        
        # Download and display changelog
        echo "Recent changes:"
        echo "---------------"
        if command -v curl &> /dev/null; then
            curl -fsSL "$CHANGELOG_URL" 2>/dev/null | head -n 50
        elif command -v wget &> /dev/null; then
            wget -q "$CHANGELOG_URL" -O - 2>/dev/null | head -n 50
        fi
        echo ""
        echo "To update, run: ./agent/scripts/update.sh"
        echo "Or: curl -fsSL https://raw.githubusercontent.com/prmichaelsen/agent-context-protocol/mainlin./agent/scripts/update.sh | bash"
    fi
    rm -f /tmp/AGENT.md.latest
    exit 1
fi
