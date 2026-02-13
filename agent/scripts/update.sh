#!/bin/bash

# Agent Context Protocol (ACP) Update Script
# This script updates AGENT.md, template files, and utility scripts from the repository

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Repository details
REPO_URL="https://github.com/prmichaelsen/agent-context-protocol.git"
BRANCH="mainline"

echo -e "${BLUE}Agent Context Protocol (ACP) Updater${NC}"
echo "======================================"
echo ""

# Check if AGENT.md exists
if [ ! -f "AGENT.md" ]; then
    echo -e "${RED}Error: AGENT.md not found in current directory${NC}"
    echo "This script should be run from your project root where AGENT.md is located."
    exit 1
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Fetching latest ACP files..."
if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR" &>/dev/null; then
    echo -e "${RED}Error: Failed to fetch repository${NC}"
    echo "Please check your internet connection and try again."
    exit 1
fi

echo -e "${GREEN}✓${NC} Latest files fetched"
echo ""

echo "Updating ACP files..."

# Update template files
cp "$TEMP_DIR/agent/design/design.template.md" "agent/design/"
cp "$TEMP_DIR/agent/design/requirements.template.md" "agent/design/"
cp "$TEMP_DIR/agent/milestones/milestone-1-{title}.template.md" "agent/milestones/"
cp "$TEMP_DIR/agent/tasks/task-1-{title}.template.md" "agent/tasks/"
cp "$TEMP_DIR/agent/patterns/pattern.template.md" "agent/patterns/"
cp "$TEMP_DIR/agent/patterns/bootstrap.template.md" "agent/patterns/"
cp "$TEMP_DIR/agent/progress.template.yaml" "agent/"

# Update AGENT.md
cp "$TEMP_DIR/AGENT.md" "."

# Update scripts
cp "$TEMP_DIR/scripts/update.sh" "agent/scripts/"
cp "$TEMP_DIR/scripts/check-for-updates.sh" "agent/scripts/"
cp "$TEMP_DIR/scripts/uninstall.sh" "agent/scripts/"
chmod +x agent/scripts/*.sh

echo -e "${GREEN}✓${NC} All files updated"
echo ""
echo -e "${GREEN}Update complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review changes: git diff"
echo "2. See what changed: git status"
echo "3. Revert if needed: git checkout <file>"
echo ""
echo "For detailed changelog:"
echo "  https://github.com/prmichaelsen/agent-context-protocol/blob/mainline/CHANGELOG.md"
echo ""
