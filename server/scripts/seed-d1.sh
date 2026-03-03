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

# Phase 5: Delete old NT morphology (MorphGNT), then seed OGNT v3
echo "Deleting old NT morphology data..."
# Batched delete to stay within D1 row-write limits
for i in $(seq 1 30); do
  result=$(npx wrangler d1 execute "$DB_NAME" --command="DELETE FROM morphology WHERE testament = 'nt' LIMIT 5000" --remote 2>&1)
  echo "  Delete batch $i..."
  # Stop when no more rows to delete (changes = 0)
  if echo "$result" | grep -q '"changes": 0'; then
    echo "  No more NT morphology rows to delete."
    break
  fi
done

echo "Importing NT morphology (OGNT v3)..."
nt_count=0
for chunk in "$SEED_DIR"/morphology-nt-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  nt_count=$((nt_count + 1))
done
echo "  NT morphology: $nt_count batches imported."

# OT Morphology from Macula Hebrew (Phase 1: per-book files with DELETE + INSERT)
echo "Importing OT morphology (Macula Hebrew)..."
ot_count=0
for chunk in "$SEED_DIR"/morphology-ot-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  ot_count=$((ot_count + 1))
done
echo "  OT morphology: $ot_count books imported."

# Phase 2: Lexicon, Versification, Cross-References
echo "Importing lexicon..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/lexicon.sql" --remote
echo "  Lexicon imported."

echo "Importing versification..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/versification.sql" --remote
echo "  Versification imported."

echo "Importing cross-references..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/cross-references.sql" --remote
echo "  Cross-references imported."

# Phase 3: Theographic entities
echo "Importing entity tables..."

echo "  Importing people..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-people.sql" --remote
echo "  Importing places..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-places.sql" --remote
echo "  Importing events..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-events.sql" --remote
echo "  Importing relationships..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-relationships.sql" --remote
echo "  Importing groups..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-groups.sql" --remote
echo "  Importing group membership..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/entities-group-membership.sql" --remote

echo "  Importing verse-people junctions..."
for chunk in "$SEED_DIR"/verse-people-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "    Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
done

echo "  Importing verse-places junctions..."
for chunk in "$SEED_DIR"/verse-places-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "    Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
done

echo "  Importing verse-events junctions..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/verse-events.sql" --remote

echo "  Importing event participants..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/event-participants.sql" --remote

echo "  Importing event locations..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/event-locations.sql" --remote

echo "  Entity tables imported."

# Phase 3a: Speaker Quotations
echo "Importing speakers..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/speakers.sql" --remote
echo "  Speakers imported."

echo "Importing quotations..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/quotations.sql" --remote
echo "  Quotations imported."

# Phase 5: Textual variants and discourse boundaries
echo "Importing textual variants..."
var_count=0
for chunk in "$SEED_DIR"/variants-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  var_count=$((var_count + 1))
done
echo "  Textual variants: $var_count batches imported."

echo "Importing discourse boundaries..."
disc_count=0
for chunk in "$SEED_DIR"/discourse-boundaries-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  disc_count=$((disc_count + 1))
done
echo "  Discourse boundaries: $disc_count batches imported."

# Phase 6: Bible verses (6 translations × 66 books)
echo "Importing bible verses..."
verse_count=0
for chunk in "$SEED_DIR"/bible-verses-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  verse_count=$((verse_count + 1))
done
echo "  $verse_count bible verse batches imported."

# Phase 7: Commentaries (6 commentary files)
echo "Importing commentaries..."
commentary_count=0
for chunk in "$SEED_DIR"/commentary-*.sql; do
  [ -f "$chunk" ] || continue
  chunk_name=$(basename "$chunk")
  echo "  Importing $chunk_name..."
  npx wrangler d1 execute "$DB_NAME" --file="$chunk" --remote
  commentary_count=$((commentary_count + 1))
done
echo "  $commentary_count commentary files imported."

# Post-seed verification
echo ""
echo "=== Verification ==="
npx wrangler d1 execute "$DB_NAME" --command="SELECT translation, COUNT(*) as count FROM bible_verses GROUP BY translation;" --remote
npx wrangler d1 execute "$DB_NAME" --command="SELECT commentary, COUNT(*) as count FROM commentary_entries GROUP BY commentary;" --remote

echo ""
echo "=== Seeding complete. NT: $nt_count batches, OT: $ot_count books, Variants: $var_count, Discourse: $disc_count, Verses: $verse_count, Commentaries: $commentary_count ==="
