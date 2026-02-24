#!/usr/bin/env python3
"""
Fill missing ot_quote_sources using OpenBible cross-references.

For each Levinsohn quote with no OT source, looks up the NT verse in
OpenBible's confidence-ranked cross-reference dataset, filters for OT targets,
and takes the highest-confidence match.

Usage:
  python3 fill-ot-sources.py

Outputs:
  d1-seed/ot-sources-openbible.sql   — INSERT OR IGNORE statements
  fill-report.json                   — match stats and unmatched list
"""

import json
import subprocess
import csv
import io
import re
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CROSSREF_FILE = SCRIPT_DIR / "cross_references.txt"
OUT_SQL = SCRIPT_DIR.parent / "d1-seed" / "ot-sources-openbible.sql"
OUT_REPORT = SCRIPT_DIR / "fill-report.json"

# ── Book name mappings ────────────────────────────────────────────────────────

# Our canonical → OpenBible OSIS prefix
NT_CANONICAL_TO_OSIS = {
    'matthew': 'Matt', 'mark': 'Mark', 'luke': 'Luke', 'john': 'John',
    'acts': 'Acts', 'romans': 'Rom', '1_corinthians': '1Cor',
    '2_corinthians': '2Cor', 'galatians': 'Gal', 'ephesians': 'Eph',
    'philippians': 'Phil', 'colossians': 'Col', '1_thessalonians': '1Thess',
    '2_thessalonians': '2Thess', '1_timothy': '1Tim', '2_timothy': '2Tim',
    'titus': 'Titus', 'philemon': 'Phlm', 'hebrews': 'Heb', 'james': 'Jas',
    '1_peter': '1Pet', '2_peter': '2Pet', '1_john': '1John',
    '2_john': '2John', '3_john': '3John', 'jude': 'Jude',
    'revelation': 'Rev',
}

# OpenBible OSIS prefix → our canonical OT book name
OT_OSIS_TO_CANONICAL = {
    'Gen': 'genesis', 'Exod': 'exodus', 'Lev': 'leviticus', 'Num': 'numbers',
    'Deut': 'deuteronomy', 'Josh': 'joshua', 'Judg': 'judges', 'Ruth': 'ruth',
    '1Sam': '1_samuel', '2Sam': '2_samuel', '1Kgs': '1_kings',
    '2Kgs': '2_kings', '1Chr': '1_chronicles', '2Chr': '2_chronicles',
    'Ezra': 'ezra', 'Neh': 'nehemiah', 'Esth': 'esther', 'Job': 'job',
    'Ps': 'psalms', 'Prov': 'proverbs', 'Eccl': 'ecclesiastes',
    'Song': 'song_of_songs', 'Isa': 'isaiah', 'Jer': 'jeremiah',
    'Lam': 'lamentations', 'Ezek': 'ezekiel', 'Dan': 'daniel',
    'Hos': 'hosea', 'Joel': 'joel', 'Amos': 'amos', 'Obad': 'obadiah',
    'Jonah': 'jonah', 'Mic': 'micah', 'Nah': 'nahum', 'Hab': 'habakkuk',
    'Zeph': 'zephaniah', 'Hag': 'haggai', 'Zech': 'zechariah', 'Mal': 'malachi',
}

OT_OSIS_PREFIXES = set(OT_OSIS_TO_CANONICAL.keys())

# ── Step 1: Query D1 for sourceless quotes ────────────────────────────────────

def get_sourceless_quotes():
    """Query remote D1 for all quotes with no ot_quote_sources row."""
    sql = (
        "SELECT q.id, q.nt_book, q.nt_chapter, q.nt_verse "
        "FROM ot_quotes q "
        "LEFT JOIN ot_quote_sources s ON s.quote_id = q.id "
        "WHERE s.id IS NULL "
        "ORDER BY q.nt_book, q.nt_chapter, q.nt_verse"
    )
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "claude-of-alexandria",
         "--command", sql, "--remote", "--json"],
        capture_output=True, text=True, cwd=SCRIPT_DIR.parent
    )
    if result.returncode != 0:
        raise RuntimeError(f"D1 query failed: {result.stderr}")

    data = json.loads(result.stdout)
    rows = data[0]["results"]
    print(f"Sourceless quotes in D1: {len(rows)}")
    return rows

# ── Step 2: Load OpenBible cross-references ───────────────────────────────────

def load_crossrefs():
    """
    Load cross_references.txt into a dict:
      nt_osis_key (e.g. 'Rom.3.11') → list of (ot_canonical, chapter, verse, votes)
    sorted by votes descending.
    """
    crossrefs = defaultdict(list)
    ot_prefixes_pattern = re.compile(
        r'^(' + '|'.join(re.escape(p) for p in OT_OSIS_PREFIXES) + r')\.'
    )

    with open(CROSSREF_FILE, encoding='utf-8') as f:
        reader = csv.reader(f, delimiter='\t')
        for row in reader:
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                continue
            from_verse, to_verse, votes_str = row[0], row[1], row[2]
            try:
                votes = int(votes_str)
            except ValueError:
                continue

            # We want NT → OT (from=NT, to=OT) AND OT → NT (from=OT, to=NT)
            # Check both directions for our NT verses
            for nt_ref, ot_ref in [(from_verse, to_verse), (to_verse, from_verse)]:
                if not ot_prefixes_pattern.match(ot_ref):
                    continue
                # nt_ref should be NT; quick check: not an OT prefix
                ot_book_nt = ot_ref.split('.')[0]
                nt_book_part = nt_ref.split('.')[0]
                if nt_book_part in OT_OSIS_PREFIXES:
                    continue  # both OT, skip
                # Parse OT ref — handle ranges like Isa.40.3-Isa.40.5
                # Strip any range suffix (take start ref only)
                ot_ref_start = ot_ref.split('-')[0]
                ot_parts = ot_ref_start.split('.')
                if len(ot_parts) < 3:
                    continue
                ot_book_osis = ot_parts[0]
                try:
                    ot_ch = int(ot_parts[1])
                    ot_vs = int(ot_parts[2])
                except ValueError:
                    continue
                ot_canonical = OT_OSIS_TO_CANONICAL.get(ot_book_osis)
                if not ot_canonical:
                    continue
                crossrefs[nt_ref].append((ot_canonical, ot_ch, ot_vs, votes))

    # Sort each bucket by votes descending
    for key in crossrefs:
        crossrefs[key].sort(key=lambda x: -x[3])

    print(f"Cross-reference NT keys loaded: {len(crossrefs)}")
    return crossrefs

# ── Step 3: Match and generate SQL ───────────────────────────────────────────

def nt_key(nt_book_canonical, chapter, verse):
    """Build OpenBible OSIS key for an NT verse, e.g. 'Rom.3.11'"""
    osis = NT_CANONICAL_TO_OSIS.get(nt_book_canonical)
    if not osis:
        return None
    return f"{osis}.{chapter}.{verse}"

def generate_sql(sourceless, crossrefs):
    matched = []
    unmatched = []

    for row in sourceless:
        qid = row['id']
        nt_book = row['nt_book']
        ch = row['nt_chapter']
        vs = row['nt_verse']
        key = nt_key(nt_book, ch, vs)
        if not key:
            unmatched.append({'id': qid, 'nt': f"{nt_book} {ch}:{vs}", 'reason': 'no OSIS mapping'})
            continue
        hits = crossrefs.get(key, [])
        if not hits:
            unmatched.append({'id': qid, 'nt': f"{nt_book} {ch}:{vs}", 'reason': 'no OT crossref found'})
            continue
        # Take top hit (highest votes)
        ot_canonical, ot_ch, ot_vs, votes = hits[0]
        matched.append({
            'quote_id': qid,
            'nt': f"{nt_book} {ch}:{vs}",
            'ot_book': ot_canonical,
            'ot_chapter': ot_ch,
            'ot_verse': ot_vs,
            'votes': votes,
        })

    return matched, unmatched

def write_sql(matched):
    lines = [
        "-- OT source gap fill via OpenBible cross-references (CC BY)",
        "-- source_type: openbible_crossref (confidence-ranked, not text-verified)",
        "-- Only fills quotes that had no source from Levinsohn+STEPBible merge.",
        "",
    ]
    for m in matched:
        lines.append(
            f"INSERT OR IGNORE INTO ot_quote_sources (quote_id, ot_book, ot_chapter, ot_verse) "
            f"VALUES ({m['quote_id']}, '{m['ot_book']}', {m['ot_chapter']}, {m['ot_verse']});"
        )
    return "\n".join(lines) + "\n"

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Step 1: Querying D1 for sourceless quotes...")
    sourceless = get_sourceless_quotes()

    print("Step 2: Loading OpenBible cross-references...")
    crossrefs = load_crossrefs()

    print("Step 3: Matching...")
    matched, unmatched = generate_sql(sourceless, crossrefs)

    print(f"\nResults:")
    print(f"  Sourceless quotes:  {len(sourceless)}")
    print(f"  Matched:            {len(matched)}")
    print(f"  Unmatched:          {len(unmatched)}")
    print(f"  Match rate:         {len(matched)/len(sourceless)*100:.0f}%")

    # Write SQL
    sql_lines = [
        "-- OT source gap fill via OpenBible cross-references (CC BY)",
        "-- source_type confidence-ranked; not text-verified like STEPBible entries.",
        "-- Only fills quotes that had no source from the Levinsohn+STEPBible merge.",
        "",
    ]
    for m in matched:
        sql_lines.append(
            f"INSERT OR IGNORE INTO ot_quote_sources "
            f"(quote_id, ot_book, ot_chapter, ot_verse) VALUES "
            f"({m['quote_id']}, '{m['ot_book']}', {m['ot_chapter']}, {m['ot_verse']});"
        )
    OUT_SQL.write_text("\n".join(sql_lines) + "\n")
    print(f"\nSQL written to: {OUT_SQL}")

    # Write report
    report = {
        'total_sourceless': len(sourceless),
        'matched': len(matched),
        'unmatched': len(unmatched),
        'match_rate_pct': round(len(matched) / len(sourceless) * 100, 1),
        'matched_sample': matched[:10],
        'unmatched_list': unmatched,
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2))
    print(f"Report written to: {OUT_REPORT}")

if __name__ == '__main__':
    main()
