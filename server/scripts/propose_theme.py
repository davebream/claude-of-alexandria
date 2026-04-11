#!/usr/bin/env python3
"""
Propose new themes for semantic_groups.yaml with lexicon evidence.

Two modes:
  --discover               Find uncovered lemmas and cluster by lexicon domain
  --theme NAME --desc "…"  Find lemmas for a named theme from lexicon data

Usage (run from repo root):
  python3 server/scripts/propose_theme.py directed --theme exile --desc "forced displacement, captivity, return"
  python3 server/scripts/propose_theme.py discover --min-freq 20
"""
import argparse
import csv
import io
import json
import re
import sys
import yaml
from pathlib import Path

# Add scripts dir to path for mcp_client import
sys.path.insert(0, str(Path(__file__).parent))
from mcp_client import MCPClient

SEMANTIC_GROUPS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
NT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt_lemmas.yaml"
OT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot_lemmas.yaml"
LEXICON_SQL_PATH = "server/d1-seed/lexicon.sql"


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def get_covered_lemmas(semantic_groups):
    """Return sets of all lemmas already covered by any theme."""
    covered_nt = set()
    covered_ot = set()
    for theme, group in semantic_groups["semantic_groups"].items():
        for lemma in group.get("nt_lemmas", {}):
            covered_nt.add(lemma)
        for strong_id in group.get("ot_strongs", {}):
            covered_ot.add(strong_id)
    return covered_nt, covered_ot


def get_existing_themes_for_lemma(semantic_groups, lemma):
    """Return list of themes that already contain this lemma."""
    themes = []
    for theme, group in semantic_groups["semantic_groups"].items():
        if lemma in group.get("nt_lemmas", {}):
            themes.append(theme)
        if lemma in group.get("ot_strongs", {}):
            themes.append(theme)
    return themes


def parse_lexicon_sql(path):
    """Parse lexicon.sql INSERT statements into a list of dicts.

    Each dict has: strongs_id, disambiguated, testament, original_word,
    original_word_nfc, original_word_stripped, transliteration, morphology,
    gloss, meaning.
    """
    text = Path(path).read_text()
    entries = []
    # Match each row tuple in the VALUES clause
    # Format: ('H1', 'H0001I = ...', 'ot', 'אָב', ..., 'gloss', 'meaning'),
    pattern = re.compile(
        r"\(('(?:[^'\\]|'')*'(?:\s*,\s*'(?:[^'\\]|'')*')*)\)",
    )
    for match in pattern.finditer(text):
        row_text = match.group(1)
        # Parse the CSV-like row using Python's csv module
        reader = csv.reader(io.StringIO(row_text), quotechar="'",
                            skipinitialspace=True)
        try:
            fields = next(reader)
        except StopIteration:
            continue
        if len(fields) < 10:
            continue
        entries.append({
            "strongs_id": fields[0],
            "disambiguated": fields[1],
            "testament": fields[2],
            "original_word": fields[3],
            "transliteration": fields[6],
            "morphology": fields[7],
            "gloss": fields[8],
            "meaning": fields[9],
        })
    return entries


def search_lexicon(entries, keywords, testament=None):
    """Search lexicon entries by keyword matching on gloss and meaning.

    Returns entries sorted by match quality (number of keywords matched).
    """
    results = []
    keywords_lower = [kw.lower().strip() for kw in keywords]

    for entry in entries:
        if testament and entry["testament"] != testament:
            continue
        # Skip the header row
        if entry["strongs_id"] == "eStrong#":
            continue

        gloss = (entry["gloss"] or "").lower()
        meaning = (entry["meaning"] or "").lower()
        searchable = f"{gloss} {meaning}"

        matched = sum(1 for kw in keywords_lower if kw in searchable)
        if matched > 0:
            results.append((matched, entry))

    results.sort(key=lambda x: -x[0])
    return [entry for _, entry in results]


def main():
    parser = argparse.ArgumentParser(
        description="Propose new themes for semantic_groups.yaml"
    )
    subparsers = parser.add_subparsers(dest="mode", required=True)

    # Directed mode: find lemmas for a named theme
    directed = subparsers.add_parser(
        "directed", help="Find lemmas for a named theme from lexicon data"
    )
    directed.add_argument("--theme", required=True, help="Theme name")
    directed.add_argument(
        "--desc", required=True, help="Comma-separated keywords describing the theme"
    )
    directed.add_argument(
        "--testament",
        choices=["ot", "nt"],
        default=None,
        help="Restrict to OT or NT entries",
    )
    directed.add_argument(
        "--top", type=int, default=20, help="Number of top results to show"
    )

    # Discovery mode: find uncovered lemmas
    discover = subparsers.add_parser(
        "discover", help="Find uncovered lemmas and cluster by lexicon domain"
    )
    discover.add_argument(
        "--min-freq", type=int, default=20, help="Minimum frequency threshold"
    )

    args = parser.parse_args()

    if args.mode == "directed":
        keywords = [kw.strip() for kw in args.desc.split(",")]
        entries = parse_lexicon_sql(LEXICON_SQL_PATH)
        results = search_lexicon(entries, keywords, testament=args.testament)

        print(f"\nTheme: {args.theme}")
        print(f"Keywords: {', '.join(keywords)}")
        print(f"Found {len(results)} matching entries (showing top {args.top}):\n")

        for entry in results[: args.top]:
            testament_label = entry["testament"].upper()
            print(
                f"  [{testament_label}] {entry['strongs_id']:8s} "
                f"{entry['original_word']:20s} "
                f"({entry['transliteration']}) — {entry['gloss']}"
            )

    elif args.mode == "discover":
        print("Discovery mode not yet implemented.")
        sys.exit(1)


if __name__ == "__main__":
    main()
