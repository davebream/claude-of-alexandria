#!/usr/bin/env python3
"""
Analyze which high-frequency biblical lemmas are not covered by any existing theme.

Usage (run from repo root):
  python3 server/scripts/analyze-theme-gaps.py
  python3 server/scripts/analyze-theme-gaps.py --min-freq 20
  python3 server/scripts/analyze-theme-gaps.py --testament nt
"""
import argparse
import yaml
from pathlib import Path

SEMANTIC_GROUPS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
NT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt_lemmas.yaml"
OT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot_lemmas.yaml"


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def get_covered_lemmas(semantic_groups):
    """Return set of all lemmas already covered by any theme."""
    covered_nt = set()
    covered_ot = set()
    for theme, group in semantic_groups["semantic_groups"].items():
        for lemma in group.get("nt_lemmas", {}):
            covered_nt.add(lemma)
        for strong_id in group.get("ot_strongs", {}):
            covered_ot.add(strong_id)
    return covered_nt, covered_ot


def get_canon_frequencies_nt(nt_lemmas):
    """Return {lemma: total_across_canon} for NT."""
    totals = {}
    for book, book_data in nt_lemmas.get("books", {}).items():
        for lemma, lemma_data in book_data.get("lemmas", {}).items():
            totals[lemma] = totals.get(lemma, 0) + lemma_data.get("total", 0)
    return totals


def get_canon_frequencies_ot(ot_lemmas):
    """Return {strong_id: total_across_canon} for OT."""
    totals = {}
    for book, book_data in ot_lemmas.get("books", {}).items():
        for strong_id, lemma_data in book_data.get("lemmas", {}).items():
            totals[strong_id] = totals.get(strong_id, 0) + lemma_data.get("total", 0)
    return totals


def get_existing_theme_density(semantic_groups):
    """Return themes with fewer than N lemmas (sparse coverage)."""
    sparse = []
    for theme, group in semantic_groups["semantic_groups"].items():
        nt_count = len(group.get("nt_lemmas", {}))
        ot_count = len(group.get("ot_strongs", {}))
        if nt_count <= 1 or ot_count <= 1:
            sparse.append({
                "theme": theme,
                "nt_lemmas": nt_count,
                "ot_strongs": ot_count,
            })
    return sorted(sparse, key=lambda x: x["nt_lemmas"] + x["ot_strongs"])


def main():
    parser = argparse.ArgumentParser(description="Analyze theme coverage gaps")
    parser.add_argument("--min-freq", type=int, default=10, help="Min canon-wide frequency to report")
    parser.add_argument("--testament", choices=["nt", "ot", "both"], default="both")
    parser.add_argument("--top", type=int, default=50, help="Show top N uncovered lemmas")
    args = parser.parse_args()

    semantic = load_yaml(SEMANTIC_GROUPS_PATH)
    covered_nt, covered_ot = get_covered_lemmas(semantic)

    print(f"\n=== EXISTING COVERAGE ===")
    print(f"Themes: {len(semantic['semantic_groups'])}")
    print(f"NT lemmas covered: {len(covered_nt)}")
    print(f"OT strongs covered: {len(covered_ot)}")

    if args.testament in ("nt", "both"):
        nt_lemmas = load_yaml(NT_LEMMAS_PATH)
        nt_freqs = get_canon_frequencies_nt(nt_lemmas)
        uncovered_nt = {
            lemma: freq
            for lemma, freq in nt_freqs.items()
            if lemma not in covered_nt and freq >= args.min_freq
        }
        ranked_nt = sorted(uncovered_nt.items(), key=lambda x: -x[1])

        print(f"\n=== TOP {args.top} UNCOVERED NT LEMMAS (min freq={args.min_freq}) ===")
        print(f"Total uncovered NT lemmas with freq >= {args.min_freq}: {len(uncovered_nt)}")
        print(f"{'Rank':<5} {'Frequency':<10} {'Lemma'}")
        print("-" * 40)
        for i, (lemma, freq) in enumerate(ranked_nt[:args.top], 1):
            print(f"{i:<5} {freq:<10} {lemma}")

    if args.testament in ("ot", "both"):
        ot_lemmas = load_yaml(OT_LEMMAS_PATH)
        ot_freqs = get_canon_frequencies_ot(ot_lemmas)
        uncovered_ot = {
            strong_id: freq
            for strong_id, freq in ot_freqs.items()
            if strong_id not in covered_ot and freq >= args.min_freq
        }
        ranked_ot = sorted(uncovered_ot.items(), key=lambda x: -x[1])

        print(f"\n=== TOP {args.top} UNCOVERED OT STRONGS (min freq={args.min_freq}) ===")
        print(f"Total uncovered OT lemmas with freq >= {args.min_freq}: {len(uncovered_ot)}")
        print(f"{'Rank':<5} {'Frequency':<10} {'Strong ID'}")
        print("-" * 40)
        for i, (strong_id, freq) in enumerate(ranked_ot[:args.top], 1):
            print(f"{i:<5} {freq:<10} {strong_id}")

    print(f"\n=== SPARSE EXISTING THEMES (≤1 NT or ≤1 OT lemma) ===")
    sparse = get_existing_theme_density(semantic)
    print(f"{'Theme':<30} {'NT lemmas':<12} {'OT strongs'}")
    print("-" * 55)
    for item in sparse:
        print(f"{item['theme']:<30} {item['nt_lemmas']:<12} {item['ot_strongs']}")


if __name__ == "__main__":
    main()
