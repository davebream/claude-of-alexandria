#!/usr/bin/env python3
"""
Generate idempotent `vocabulary` table SQL from the extractor reference JSONs.

This is the missing reproducible link in the vocabulary pipeline. The historical
path built a local sibling SQLite DB (../claude-of-alexandria-mcp/data/biblical.sqlite)
and exported it via export-d1.ts — a machine that no longer exists cannot
reproduce that. This converter goes straight from the per-book JSON that
extract_nt_vocabulary.py / extract_ot_vocabulary.py already emit to the SQL that
replaces the `vocabulary` table's contents, so a regeneration needs only the
pinned upstream corpora and these scripts — nothing else.

Delivery follows decisions/0005 (generate-in-runner, never committed) and 0006
(per-book staging files to bound each D1 request). The output is applied to
production D1 by .github/workflows/regenerate-vocabulary.yml.

The `vocabulary` table is a complete per-(book, chapter, lemma) frequency index:
  book       — canonical lowercase (filename stem, e.g. "1_corinthians")
  testament  — "nt" | "ot" (which input directory the file came from)
  chapter    — integer
  lemma      — Greek lexical form (NT) or Strong's number (OT), as the JSON keys it
  frequency  — count of that lemma in that chapter (derived from the verses array)

Usage:
    python generate-vocabulary-sql.py \
        --nt-dir <reference/vocabulary/nt> \
        --ot-dir <reference/vocabulary/ot> \
        --out-dir <staging-dir>
    python generate-vocabulary-sql.py --nt-dir ... --ot-dir ... --verify

Output (in --out-dir):
    00-reset.sql            -> DELETE FROM vocabulary;   (applied first)
    nt-<canonical>.sql      -> INSERTs for one NT book
    ot-<canonical>.sql      -> INSERTs for one OT book
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

# Rows per multi-row INSERT. One statement per row (as the old data.sql did)
# bloats the file; a few hundred rows per statement stays well within D1's
# statement limits while keeping the file compact.
ROWS_PER_INSERT = 400

VocRow = Tuple[int, str, int]  # (chapter, lemma, frequency)


# ─── Functional core (pure: input in, value out — no I/O) ─────────────────────

def chapter_frequencies(lemmas: Dict) -> List[VocRow]:
    """
    Aggregate an extractor `lemmas` dict into (chapter, lemma, frequency) rows.

    Each lemma entry is {total, verses: ["ch:vs", ...]} with duplicates
    preserved, so the per-chapter frequency is the count of verses entries whose
    chapter component matches. `total` is NOT trusted — it is re-derived from the
    verses array, the authoritative per-occurrence record.
    """
    rows: List[VocRow] = []
    for lemma, data in lemmas.items():
        per_chapter: Dict[int, int] = defaultdict(int)
        for verse_ref in data.get('verses', []):
            chapter = int(str(verse_ref).split(':', 1)[0])
            per_chapter[chapter] += 1
        for chapter in sorted(per_chapter):
            rows.append((chapter, lemma, per_chapter[chapter]))
    # Deterministic order: chapter, then lemma. Stable output → clean diffs.
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


def _sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def book_insert_sql(book: str, testament: str, rows: List[VocRow]) -> str:
    """Render one book's rows as batched multi-row INSERT statements."""
    if not rows:
        return ''
    cols = '(book, testament, chapter, lemma, frequency)'
    out: List[str] = []
    for start in range(0, len(rows), ROWS_PER_INSERT):
        batch = rows[start:start + ROWS_PER_INSERT]
        values = ',\n'.join(
            f"  ({_sql_str(book)}, {_sql_str(testament)}, {chapter}, {_sql_str(lemma)}, {freq})"
            for (chapter, lemma, freq) in batch
        )
        out.append(f"INSERT INTO vocabulary {cols} VALUES\n{values};")
    return '\n'.join(out) + '\n'


# ─── Imperative shell (reads/writes the world) ────────────────────────────────

def canonical_from_path(json_path: Path) -> str:
    """Filename stem is the canonical book key the table stores (e.g. '1_corinthians')."""
    return json_path.stem


def load_book(json_path: Path) -> Dict:
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def iter_books(directory: Path):
    for json_path in sorted(directory.glob('*.json')):
        yield canonical_from_path(json_path), load_book(json_path)


def write_sql(nt_dir: Path, ot_dir: Path, out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Full-table replace: reset applied first, then every book re-inserted.
    (out_dir / '00-reset.sql').write_text('DELETE FROM vocabulary;\n', encoding='utf-8')

    total_rows = 0
    for testament, directory in (('nt', nt_dir), ('ot', ot_dir)):
        if not directory.exists():
            print(f"Warning: {testament} dir not found: {directory}", file=sys.stderr)
            continue
        for canonical, book_data in iter_books(directory):
            rows = chapter_frequencies(book_data.get('lemmas', {}))
            total_rows += len(rows)
            sql = book_insert_sql(canonical, testament, rows)
            (out_dir / f"{testament}-{canonical}.sql").write_text(sql, encoding='utf-8')
    print(f"Wrote {total_rows} vocabulary rows across per-book files to {out_dir}/")
    return total_rows


def verify(nt_dir: Path, ot_dir: Path) -> bool:
    """
    Self-check mirroring the extractors' print-based verification. Proves the
    converter faithfully reflects its input JSON — so a min=1 regeneration will
    carry rare-per-book occurrences the old thresholded data dropped.
    """
    print("\nVerification (reflects the CURRENT input JSONs' threshold):")
    ok = True

    john = nt_dir / 'john.json'
    acts = nt_dir / 'acts.json'
    if john.exists() and acts.exists():
        john_rows = chapter_frequencies(load_book(john).get('lemmas', {}))
        acts_rows = chapter_frequencies(load_book(acts).get('lemmas', {}))
        john_metaxu = [r for r in john_rows if r[1] == 'μεταξύ']
        acts_metaxu = sum(r[2] for r in acts_rows if r[1] == 'μεταξύ')
        # Under the min-3 JSONs μεταξύ is absent from John and totals 3 in Acts;
        # under min-1 regenerated JSONs John gains μεταξύ 4:1. Report both facts.
        print(f"  John μεταξύ rows: {len(john_metaxu)} (min-3 input: 0; min-1 input: 1 at chapter 4)")
        print(f"  Acts μεταξύ total: {acts_metaxu} (expected 3 — present in both thresholds)")
        if acts_metaxu != 3:
            print("  [FAIL] Acts μεταξύ total should be 3")
            ok = False
    else:
        print("  [SKIP] john.json / acts.json not present")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate vocabulary table SQL from extractor JSONs')
    parser.add_argument('--nt-dir', required=True, help='Directory of NT per-book JSON files')
    parser.add_argument('--ot-dir', required=True, help='Directory of OT per-book JSON files')
    parser.add_argument('--out-dir', help='Output directory for per-book staging SQL')
    parser.add_argument('--verify', action='store_true', help='Run self-check and exit')
    args = parser.parse_args()

    nt_dir = Path(args.nt_dir)
    ot_dir = Path(args.ot_dir)

    if args.verify:
        sys.exit(0 if verify(nt_dir, ot_dir) else 1)

    if not args.out_dir:
        parser.error('--out-dir is required unless --verify is given')
    write_sql(nt_dir, ot_dir, Path(args.out_dir))


if __name__ == '__main__':
    main()
