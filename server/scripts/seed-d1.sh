#!/bin/bash
set -e

DB_NAME="claude-of-alexandria"
SEED_DIR="$(dirname "$0")/../d1-seed"

echo "=== Seeding D1 database: $DB_NAME ==="
echo ""

# Apply schema migrations (tracked — safe to run repeatedly)
# To check which migrations are pending: npx wrangler d1 migrations list $DB_NAME --remote
# For a full reset (drop all tables and re-seed from scratch):
#   Run the DROP commands manually, then re-run this script.
echo "Applying schema migrations..."
npx wrangler d1 migrations apply "$DB_NAME" --remote
echo "  Schema up to date."
echo ""

# Small tables data (discourse features, paragraph markers, vocabulary, vocabulary clusters)
echo "Importing small tables data..."
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

# Morphology in batches (~89 chunks, takes ~20 minutes)
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
