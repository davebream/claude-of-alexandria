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


def get_canon_frequencies(testament):
    """Return {lemma: total_frequency} for the given testament."""
    if testament == "nt":
        data = load_yaml(NT_LEMMAS_PATH)
        totals = {}
        for book, book_data in data.get("books", {}).items():
            for lemma, lemma_data in book_data.get("lemmas", {}).items():
                totals[lemma] = totals.get(lemma, 0) + lemma_data.get("total", 0)
        return totals
    else:
        data = load_yaml(OT_LEMMAS_PATH)
        totals = {}
        for book, book_data in data.get("books", {}).items():
            for strong_id, lemma_data in book_data.get("lemmas", {}).items():
                totals[strong_id] = totals.get(strong_id, 0) + lemma_data.get("total", 0)
        return totals


def filter_by_frequency(candidates, frequencies, min_freq=5, testament="ot"):
    """Keep only candidates that appear at least min_freq times in the corpus.

    OT entries are keyed by Strong's ID (e.g., H1540).
    NT entries are keyed by Greek lemma form (e.g., χαρά).
    """
    kept = []
    for entry in candidates:
        key = entry["strongs_id"] if testament == "ot" else entry["original_word"]
        freq = frequencies.get(key, 0)
        if freq >= min_freq:
            entry["corpus_frequency"] = freq
            kept.append(entry)
    return kept


def check_overlap(candidates, semantic_groups, testament="ot"):
    """Flag candidates that already belong to an existing theme.

    OT: checks by Strong's ID. NT: checks by Greek lemma (original_word).
    """
    for entry in candidates:
        key = entry["strongs_id"] if testament == "ot" else entry["original_word"]
        existing = get_existing_themes_for_lemma(semantic_groups, key)
        entry["existing_themes"] = existing
    return candidates


def parse_lexicon_sql(path):
    """Parse lexicon.sql INSERT statements into a list of dicts.

    Each dict has: strongs_id, disambiguated, testament, original_word,
    transliteration, morphology, gloss, meaning.
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
        if fields[0] == "eStrong#":
            continue  # Skip header row
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


def is_proper_noun(entry):
    """Return True if the entry is a proper noun based on STEPBible morphology.

    In the STEPBible lexicon, proper nouns (personal names, place names, and
    proper noun titles) have morphology codes beginning with 'N:' — distinct
    from common Hebrew nouns ('H:N-...') and Aramaic nouns ('A:N-...').
    """
    morph = entry.get("morphology") or ""
    return morph.startswith("N:")


def search_lexicon(entries, keywords, testament=None, include_proper_nouns=False):
    """Search lexicon entries by keyword matching on gloss and meaning.

    Matches on the gloss field (primary) and meaning field (secondary).
    Proper nouns are excluded by default because their meaning fields contain
    biographical metadata that produces false positives (e.g. searching for
    "exile" returns hundreds of personal names whose biographies mention the
    exile period rather than semantic vocabulary words for exile).

    Returns entries sorted by match quality (number of keywords matched).
    """
    keywords_lower = [kw.lower().strip() for kw in keywords if kw.strip()]
    if not keywords_lower:
        return []

    results = []

    for entry in entries:
        if testament and entry["testament"] != testament:
            continue
        if not include_proper_nouns and is_proper_noun(entry):
            continue

        gloss = (entry["gloss"] or "").lower()
        meaning = (entry["meaning"] or "").lower()
        searchable = f"{gloss} {meaning}"

        matched = sum(1 for kw in keywords_lower if kw in searchable)
        if matched > 0:
            results.append((matched, entry))

    results.sort(key=lambda x: -x[0])
    return [entry for _, entry in results]


def validate_cooccurrence(mcp: MCPClient, ot_lemmas: list[str],
                          nt_lemmas: list[str],
                          sample_books: int = 5) -> dict:
    """Check how many books contain 2+ lemmas from the candidate set.

    Returns {books_with_overlap: int, total_checked: int, details: [...]}.
    """
    results = {"ot": [], "nt": []}

    # OT: check a sample of books
    ot_books = ["Genesis", "Exodus", "Isaiah", "Jeremiah", "Psalms",
                "Deuteronomy", "Ezekiel", "Daniel"]
    for book in ot_books[:sample_books]:
        try:
            vocab = mcp.query_vocabulary(book, "ot", limit=500)
            book_lemmas = {l["lemma"] for l in vocab.get("lemmas", [])}
            overlap = set(ot_lemmas) & book_lemmas
            if len(overlap) >= 2:
                results["ot"].append({"book": book, "overlap": list(overlap)})
        except Exception:
            pass

    # NT: check a sample of books
    nt_books = ["Romans", "Matthew", "Hebrews", "1 Peter",
                "Revelation", "Luke", "Acts"]
    for book in nt_books[:sample_books]:
        try:
            vocab = mcp.query_vocabulary(book, "nt", limit=500)
            book_lemmas = {l["lemma"] for l in vocab.get("lemmas", [])}
            overlap = set(nt_lemmas) & book_lemmas
            if len(overlap) >= 2:
                results["nt"].append({"book": book, "overlap": list(overlap)})
        except Exception:
            pass

    return results


def pair_cross_testament(ot_candidates, nt_candidates):
    """Find OT↔NT pairs that share gloss keywords.

    Returns list of (ot_entry, nt_entry, shared_keywords) tuples.
    """
    pairs = []

    GLOSS_STOP_WORDS = {
        "make", "come", "give", "take", "turn", "bring", "call", "send",
        "will", "from", "with", "that", "this", "have", "been", "were",
        "upon", "over", "into", "down", "away", "back", "like", "also",
        "very", "much", "many", "each", "some", "self", "used", "more",
    }

    def gloss_words(entry):
        gloss = (entry.get("gloss") or "").lower()
        # Split on comma, space, semicolon; drop short and stop words
        words = re.split(r'[,;\s]+', gloss)
        return {w for w in words if len(w) > 3 and w not in GLOSS_STOP_WORDS}

    nt_by_keywords = {}
    for nt in nt_candidates:
        for word in gloss_words(nt):
            nt_by_keywords.setdefault(word, []).append(nt)

    for ot in ot_candidates:
        ot_words = gloss_words(ot)
        # Map NT strongs_id -> (nt_entry, shared_keywords set)
        nt_matches = {}
        for word in ot_words:
            if word in nt_by_keywords:
                for nt in nt_by_keywords[word]:
                    nt_id = nt["strongs_id"]
                    if nt_id not in nt_matches:
                        nt_matches[nt_id] = (nt, set())
                    nt_matches[nt_id][1].add(word)
        for nt_entry, shared_kw in nt_matches.values():
            pairs.append((ot, nt_entry, shared_kw))

    return pairs


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
    directed.add_argument(
        "--include-proper-nouns",
        action="store_true",
        default=False,
        help="Include proper noun entries (personal names, place names) in results",
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
        results = search_lexicon(
            entries,
            keywords,
            testament=args.testament,
            include_proper_nouns=args.include_proper_nouns,
        )

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
