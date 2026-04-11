#!/usr/bin/env bash
# validate-versions.sh
#
# Ensures all version sources are in sync.
# Exit 1 if any mismatch is found.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

MARKETPLACE_VERSION=$(jq -r '.plugins[0].version' "$REPO_ROOT/.claude-plugin/marketplace.json")

if [ -z "$MARKETPLACE_VERSION" ] || [ "$MARKETPLACE_VERSION" = "null" ]; then
  echo -e "${RED}ERROR: Could not read .plugins[0].version from .claude-plugin/marketplace.json${NC}"
  exit 1
fi

SERVER_VERSION=$(jq -r '.version' "$REPO_ROOT/server/package.json")

if [ -z "$SERVER_VERSION" ] || [ "$SERVER_VERSION" = "null" ]; then
  echo -e "${RED}ERROR: Could not read .version from server/package.json${NC}"
  exit 1
fi

echo "=== Version Consistency Check ==="
echo "  marketplace.json: ${MARKETPLACE_VERSION}"
echo "  server/package.json: ${SERVER_VERSION}"

ERRORS=0

if [ "$MARKETPLACE_VERSION" != "$SERVER_VERSION" ]; then
  echo -e "${RED}✗ marketplace.json ($MARKETPLACE_VERSION) ≠ server/package.json ($SERVER_VERSION)${NC}"
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}${ERRORS} version mismatch(es) found. All versions must match marketplace.json (${MARKETPLACE_VERSION}).${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All versions in sync: ${MARKETPLACE_VERSION}${NC}"
