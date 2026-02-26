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

# Rebuild small tables (truncate-and-reload for idempotent re-seeding)
# Split into separate --command calls to avoid wrangler multi-statement parser issues on remote D1
echo "Rebuilding small tables..."

npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS discourse_features;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE discourse_features (id INTEGER PRIMARY KEY, book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, feature TEXT NOT NULL, feature_description TEXT, word TEXT);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_discourse_book ON discourse_features(book, chapter, verse);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_discourse_feature ON discourse_features(feature);" --remote

npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS paragraph_markers;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE paragraph_markers (id INTEGER PRIMARY KEY, book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, marker_type TEXT NOT NULL);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_markers_book ON paragraph_markers(book, chapter, verse);" --remote

npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS vocabulary;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE vocabulary (id INTEGER PRIMARY KEY, book TEXT NOT NULL, testament TEXT NOT NULL, chapter INTEGER NOT NULL, lemma TEXT NOT NULL, frequency INTEGER NOT NULL);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_vocab_book_lemma ON vocabulary(book, lemma);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_vocab_book_chapter ON vocabulary(book, chapter);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);" --remote

npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS vocabulary_clusters;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE vocabulary_clusters (id INTEGER PRIMARY KEY, book TEXT NOT NULL, testament TEXT NOT NULL, lemma TEXT NOT NULL, concentration REAL NOT NULL, chapter_start INTEGER NOT NULL, chapter_end INTEGER NOT NULL, total_occurrences INTEGER NOT NULL);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_clusters_book ON vocabulary_clusters(book, lemma);" --remote

npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE thematic_keywords (theme TEXT NOT NULL, lemma TEXT NOT NULL, testament TEXT NOT NULL, UNIQUE(theme, lemma, testament));" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);" --remote

echo "  Small tables rebuilt."

# Small tables data
echo "Importing small tables..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/data.sql" --remote
echo "  Small tables imported."

# Thematic keywords expansion
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
echo "  Thematic keywords expansion imported."

# Rebuild OT quotes tables (drop child before parent due to FK)
echo "Rebuilding OT quotes tables..."
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS ot_quote_sources;" --remote
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS ot_quotes;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE ot_quotes (id INTEGER PRIMARY KEY, nt_book TEXT NOT NULL, nt_chapter INTEGER NOT NULL, nt_verse INTEGER NOT NULL, greek_text TEXT NOT NULL, quote_type TEXT NOT NULL DEFAULT 'direct');" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_ot_quotes_nt ON ot_quotes(nt_book, nt_chapter, nt_verse);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE ot_quote_sources (id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES ot_quotes(id), ot_book TEXT NOT NULL, ot_chapter INTEGER NOT NULL, ot_verse INTEGER NOT NULL, ot_verse_end INTEGER);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_ot_sources_quote ON ot_quote_sources(quote_id);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_ot_sources_book ON ot_quote_sources(ot_book, ot_chapter, ot_verse);" --remote
echo "  OT quotes tables rebuilt."

# OT Quotes
echo "Importing OT quotes..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/ot-quotes.sql" --remote
echo "  OT quotes imported."

# Rebuild morphology
echo "Rebuilding morphology table..."
npx wrangler d1 execute "$DB_NAME" --command="DROP TABLE IF EXISTS morphology;" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE TABLE morphology (id INTEGER PRIMARY KEY, book TEXT NOT NULL, testament TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, word_position INTEGER NOT NULL, text TEXT NOT NULL, normalized TEXT, lemma TEXT NOT NULL, pos TEXT NOT NULL, parsing TEXT);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_morph_range ON morphology(book, testament, chapter, verse);" --remote
npx wrangler d1 execute "$DB_NAME" --command="CREATE INDEX IF NOT EXISTS idx_morph_lemma ON morphology(lemma);" --remote
echo "  Morphology table rebuilt."

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
