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
import logging
import re
import sys
import yaml
from pathlib import Path

# Add scripts dir to path for mcp_client import
sys.path.insert(0, str(Path(__file__).parent))
from mcp_client import MCPClient

# Pipeline limits for directed mode
_PAIR_LIMIT = 30          # max candidates fed into cross-testament pairing
_COOCCURRENCE_LIMIT = 10  # max lemmas sent for MCP co-occurrence check
_OUTPUT_OT_LIMIT = 8      # max OT entries in output proposal
_OUTPUT_NT_LIMIT = 6      # max NT entries in output proposal

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

    Returns {"ot": [{"book": str, "overlap": [str, ...]}, ...],
             "nt": [{"book": str, "overlap": [str, ...]}, ...]}.
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
        except Exception as e:
            logging.warning("Cooccurrence check failed for %s (%s): %s", book, "ot", e)

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
        except Exception as e:
            logging.warning("Cooccurrence check failed for %s (%s): %s", book, "nt", e)

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


_YAML_RESERVED_SCALARS = frozenset({
    "true", "false", "yes", "no", "on", "off",
    "y", "n", "null", "~",
})


def _looks_numeric(val: str) -> bool:
    """Return True if YAML would parse val as a number."""
    try:
        float(val)
        return True
    except ValueError:
        return val.lower() in (".inf", "-.inf", ".nan")


def _yaml_safe_str(val: str) -> str:
    """Return val as a YAML-safe string, quoted if it contains special chars.

    Handles punctuation specials, YAML boolean/null scalars, and numeric values.
    """
    if not val:
        return '""'
    needs_quoting = (
        any(c in val for c in (':', '#', '{', '}', '[', ']', '&', '*', '!', '|', '>', '"', '%', '@', '`'))
        or val.lower() in _YAML_RESERVED_SCALARS
        or _looks_numeric(val)
    )
    if needs_quoting:
        escaped = val.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    return val


def format_proposal(theme_name: str, description: str,
                    ot_entries: list, nt_entries: list,
                    cooccurrence: dict, primary_genres: list[str] | None = None) -> str:
    """Format a theme proposal as YAML + evidence report."""
    lines = []

    # --- YAML candidate ---
    lines.append("# ─── CANDIDATE YAML (copy to semantic_groups.yaml) ───")
    lines.append("")
    lines.append(f"  {theme_name}:")
    lines.append(f'    description: {_yaml_safe_str(description)}')
    if primary_genres:
        lines.append(f"    primary_genres: [{', '.join(primary_genres)}]")
    if nt_entries:
        lines.append("    nt_lemmas:")
        for e in nt_entries:
            lines.append(f"      {e['original_word']}: {_yaml_safe_str(e['gloss'])}")
    if ot_entries:
        lines.append("    ot_strongs:")
        for e in ot_entries:
            sid = e["strongs_id"]
            lines.append(f"      {sid}:")
            lines.append(f"        hebrew: {e['original_word']}")
            lines.append(f"        gloss: {_yaml_safe_str(e['gloss'])}")

    # --- Evidence report ---
    lines.append("")
    lines.append("# ─── EVIDENCE REPORT ───")
    lines.append("")
    for testament, entries in [("OT", ot_entries), ("NT", nt_entries)]:
        if not entries:
            continue
        lines.append(f"## {testament} Lemmas")
        for e in entries:
            sid = e.get("strongs_id", e.get("original_word", "?"))
            lines.append(f"  {sid} ({e['original_word']}) — {e['gloss']}")
            lines.append(f"    Lexicon source: STEPBible TBESH/TBESG")
            freq = e.get("corpus_frequency", "?")
            lines.append(f"    Corpus frequency: {freq}")
            existing = e.get("existing_themes", [])
            if existing:
                lines.append(f"    ⚠ Already in themes: {', '.join(existing)}")
            lines.append("")

    lines.append("## Corpus Co-occurrence")
    for testament in ["ot", "nt"]:
        books = cooccurrence.get(testament, [])
        if books:
            count = len(books)
            noun = "book" if count == 1 else "books"
            lines.append(f"  {testament.upper()}: {count} {noun} with 2+ lemma overlap")
            for b in books:
                lines.append(f"    {b['book']}: {', '.join(b['overlap'])}")
        else:
            lines.append(f"  {testament.upper()}: no books with 2+ lemma overlap")

    return "\n".join(lines)


def run_directed(args):
    """Directed mode: user names a theme, script finds the lemmas."""
    theme_name = args.theme
    description = args.desc
    keywords = [kw.strip() for kw in description.split(",")]
    min_freq = args.min_freq

    print(f"\n=== DIRECTED MODE: proposing theme '{theme_name}' ===")
    print(f"Keywords: {keywords}")
    print(f"Min corpus frequency: {min_freq}")

    # Load local data
    lexicon = parse_lexicon_sql(LEXICON_SQL_PATH)
    semantic = load_yaml(SEMANTIC_GROUPS_PATH)

    # Step 1: Search lexicon
    testament = args.testament
    print(f"\nSearching {len(lexicon)} lexicon entries (testament={testament})...")
    ot_hits = search_lexicon(lexicon, keywords, testament="ot") if testament in ("ot", "both") else []
    nt_hits = search_lexicon(lexicon, keywords, testament="nt") if testament in ("nt", "both") else []
    print(f"  OT lexicon matches: {len(ot_hits)}")
    print(f"  NT lexicon matches: {len(nt_hits)}")

    # Step 2: Frequency filter
    ot_freqs = get_canon_frequencies("ot")
    nt_freqs = get_canon_frequencies("nt")
    ot_filtered = filter_by_frequency(ot_hits, ot_freqs, min_freq, testament="ot")
    nt_filtered = filter_by_frequency(nt_hits, nt_freqs, min_freq, testament="nt")
    print(f"  After frequency filter (>={min_freq}): OT={len(ot_filtered)}, NT={len(nt_filtered)}")

    # Step 3: Deduplication
    ot_filtered = check_overlap(ot_filtered, semantic, testament="ot")
    nt_filtered = check_overlap(nt_filtered, semantic, testament="nt")

    # Step 4: Cross-testament pairing
    pairs = pair_cross_testament(ot_filtered[:_PAIR_LIMIT], nt_filtered[:_PAIR_LIMIT])
    if pairs:
        print(f"  Cross-testament pairs found: {len(pairs)}")

    # Step 5: Corpus validation
    print("\nValidating co-occurrence via MCP...")
    cooccurrence = {"ot": [], "nt": []}  # default
    mcp = MCPClient()
    try:
        mcp.list_books(include_themes=False)  # connectivity check
    except Exception as e:
        print(f"WARNING: MCP server unreachable ({e}). Skipping corpus validation.",
              file=sys.stderr)
        mcp = None

    if mcp:
        ot_ids = [e["strongs_id"] for e in ot_filtered[:_COOCCURRENCE_LIMIT]]
        nt_words = [e["original_word"] for e in nt_filtered[:_COOCCURRENCE_LIMIT]]
        try:
            cooccurrence = validate_cooccurrence(mcp, ot_ids, nt_words)
        except Exception as e:
            logging.warning("Corpus validation failed: %s", e)

    # Step 6: Output
    proposal = format_proposal(
        theme_name, description,
        ot_filtered[:_OUTPUT_OT_LIMIT], nt_filtered[:_OUTPUT_NT_LIMIT],
        cooccurrence,
    )
    print("\n" + proposal)

    # Write to file
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', theme_name)
    output_path = Path("server/scripts/output") / f"proposal-{safe_name}.txt"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(proposal)
    print(f"\nSaved to: {output_path}")


def run_discover(args):
    """Discovery mode: find uncovered lemmas and cluster by lexicon domain."""
    min_freq = args.min_freq
    top_n = args.top

    print(f"\n=== DISCOVERY MODE ===")
    print(f"Min frequency: {min_freq}, Top N: {top_n}")

    # Load data
    semantic = load_yaml(SEMANTIC_GROUPS_PATH)
    covered_nt, covered_ot = get_covered_lemmas(semantic)
    lexicon = parse_lexicon_sql(LEXICON_SQL_PATH)

    # Build lexicon lookup by strongs_id and by original_word
    lex_by_strongs = {e["strongs_id"]: e for e in lexicon}
    lex_by_word = {}
    for e in lexicon:
        lex_by_word.setdefault(e["original_word"], []).append(e)

    print(f"Existing themes: {len(semantic['semantic_groups'])}")
    print(f"Covered: {len(covered_nt)} NT lemmas, {len(covered_ot)} OT strongs")

    # Find uncovered high-frequency lemmas
    proposals = []

    # OT
    ot_freqs = get_canon_frequencies("ot")
    uncovered_ot = {
        sid: freq for sid, freq in ot_freqs.items()
        if sid not in covered_ot and freq >= min_freq
    }
    ranked_ot = sorted(uncovered_ot.items(), key=lambda x: -x[1])[:top_n]

    print(f"\nTop {len(ranked_ot)} uncovered OT lemmas (freq >= {min_freq}):")
    for sid, freq in ranked_ot:
        lex = lex_by_strongs.get(sid)
        gloss = lex["gloss"] if lex else "?"
        word = lex["original_word"] if lex else "?"
        print(f"  {sid} ({word}) freq={freq} — {gloss}")

    # NT
    nt_freqs = get_canon_frequencies("nt")
    uncovered_nt = {
        lemma: freq for lemma, freq in nt_freqs.items()
        if lemma not in covered_nt and freq >= min_freq
    }
    ranked_nt = sorted(uncovered_nt.items(), key=lambda x: -x[1])[:top_n]

    print(f"\nTop {len(ranked_nt)} uncovered NT lemmas (freq >= {min_freq}):")
    for lemma, freq in ranked_nt:
        lex_entries = lex_by_word.get(lemma, [])
        gloss = lex_entries[0]["gloss"] if lex_entries else "?"
        print(f"  {lemma} freq={freq} — {gloss}")

    # Cluster by shared gloss keywords
    print("\n=== SUGGESTED CLUSTERS (by shared gloss words) ===")
    all_uncovered = []
    for sid, freq in ranked_ot:
        lex = lex_by_strongs.get(sid)
        if lex:
            lex["corpus_frequency"] = freq
            lex["_testament"] = "ot"
            all_uncovered.append(lex)
    for lemma, freq in ranked_nt:
        lex_entries = lex_by_word.get(lemma, [])
        if lex_entries:
            lex_entries[0]["corpus_frequency"] = freq
            lex_entries[0]["_testament"] = "nt"
            all_uncovered.append(lex_entries[0])

    # Simple keyword clustering
    keyword_groups = {}
    for entry in all_uncovered:
        gloss = (entry.get("gloss") or "").lower()
        words = set(re.split(r'[,;\s]+', gloss)) - {"", "to", "be", "a", "the", "of", "in", "and", "or", "for"}
        for word in words:
            if len(word) > 3:
                keyword_groups.setdefault(word, []).append(entry)

    # Show clusters with 2+ entries from different testaments
    shown = set()
    for keyword, entries in sorted(keyword_groups.items(), key=lambda x: -len(x[1])):
        testaments = {e["_testament"] for e in entries}
        if len(entries) >= 2 and len(testaments) >= 2 and keyword not in shown:
            shown.add(keyword)
            print(f"\n  Cluster '{keyword}' ({len(entries)} lemmas):")
            for e in entries[:6]:
                t = e["_testament"].upper()
                print(f"    [{t}] {e.get('strongs_id', e['original_word'])} — {e['gloss']} (freq={e['corpus_frequency']})")


def main():
    parser = argparse.ArgumentParser(
        description="Propose new themes for semantic_groups.yaml with lexicon evidence"
    )
    sub = parser.add_subparsers(dest="mode")

    # Directed mode
    directed = sub.add_parser("directed", help="Propose a named theme")
    directed.add_argument("--theme", required=True, help="Theme key name (e.g., exile)")
    directed.add_argument("--desc", required=True,
                          help="Comma-separated description keywords (e.g., 'forced displacement, captivity, return')")
    directed.add_argument("--testament", choices=["ot", "nt", "both"], default="both",
                          help="Search OT only, NT only, or both (default: both)")
    directed.add_argument("--min-freq", type=int, default=5,
                          help="Min corpus frequency to include a lemma (default: 5)")

    # Discovery mode (Task 8)
    discover = sub.add_parser("discover", help="Discover missing themes from gaps")
    discover.add_argument("--min-freq", type=int, default=10,
                          help="Min corpus frequency for gap analysis (default: 10)")
    discover.add_argument("--top", type=int, default=30,
                          help="Top N uncovered lemmas to analyze (default: 30)")

    args = parser.parse_args()
    if args.mode == "directed":
        run_directed(args)
    elif args.mode == "discover":
        run_discover(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
