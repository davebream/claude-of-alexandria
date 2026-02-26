#!/bin/bash
set -e

DB_NAME="claude-of-alexandria"
SEED_DIR="$(dirname "$0")/../d1-seed"

echo "=== Seeding D1 database: $DB_NAME ==="
echo ""

# Schema first
echo "Applying schema..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/schema.sql" --remote
echo "  Schema applied."

# Rebuild thematic_keywords with UNIQUE constraint (DROP+CREATE ensures constraint applies to existing DBs)
# Split into separate commands to avoid wrangler multi-statement parser issues on remote D1
echo "Rebuilding thematic_keywords table..."
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE thematic_keywords (theme TEXT NOT NULL, lemma TEXT NOT NULL, testament TEXT NOT NULL, UNIQUE(theme, lemma, testament));" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);" --remote
echo "  Rebuilt."

# Small tables
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote
echo "  Small tables imported."

# Thematic keywords expansion
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
echo "  Thematic keywords expansion imported."

# OT Quotes
echo "Importing OT quotes..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/ot-quotes.sql" --remote
echo "  OT quotes imported."

# Morphology in batches
echo "Importing morphology..."
chunk_count=0
for chunk in "$SEED_DIR"/morphology-*.sql; do
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  chunk_count=$((chunk_count + 1))
done

echo ""
echo "=== Seeding complete. $chunk_count morphology batches imported. ==="
