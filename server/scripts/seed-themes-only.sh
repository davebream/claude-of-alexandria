#!/bin/bash
set -e

DB_NAME="claude-of-alexandria"
SEED_DIR="$(dirname "$0")/../d1-seed"

echo "=== Re-seeding thematic_keywords only: $DB_NAME ==="
echo ""

# Step 1: Clear all existing thematic keywords
# Using --command (single statement, no file parser needed)
echo "Clearing existing thematic keywords..."
npx wrangler d1 execute "$DB_NAME" --command="DELETE FROM thematic_keywords;" --remote
echo "  Cleared."
echo ""

# Step 2: Import the regenerated thematic keywords expansion
# Using --file (plain INSERT OR IGNORE statements, no transaction wrapper)
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
echo "  Imported."
echo ""

# Step 3: Verify row count and theme count
echo "Verifying..."
npx wrangler d1 execute "$DB_NAME" \
  --command="SELECT COUNT(*) AS total_rows FROM thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" \
  --command="SELECT COUNT(DISTINCT theme) AS total_themes FROM thematic_keywords;" --remote

echo ""
echo "=== Theme re-seed complete ==="
