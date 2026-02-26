#!/usr/bin/env python3
"""
Cross-check thematic OT Strong's codes against the ot_lemmas.yaml corpus.

Usage:
  python3 server/scripts/verify-thematic-coverage.py
  python3 server/scripts/verify-thematic-coverage.py --book Psalms
  python3 server/scripts/verify-thematic-coverage.py --theme suffering
"""
import argparse
import yaml
from pathlib import Path

SEMANTIC_GROUPS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
OT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot_lemmas.yaml"


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def build_lemma_index(ot_lemmas):
    """
    Return: {strong_id: {book: count, ...}, ...}
    Only includes books present in ot_lemmas.yaml.
    """
    index = {}
    for book, book_data in ot_lemmas.get("books", {}).items():
        for strong_id, lemma_data in book_data.get("lemmas", {}).items():
            if strong_id not in index:
                index[strong_id] = {}
            index[strong_id][book] = lemma_data.get("total", 0)
    return index


def report_theme(theme, group, lemma_index, filter_book=None):
    ot_strongs = group.get("ot_strongs", {})
    if not ot_strongs:
        print(f"  [no OT entries]")
        return

    for strong_id, info in ot_strongs.items():
        hebrew = info.get("hebrew", "?")
        gloss = info.get("gloss", "?")
        book_counts = lemma_index.get(strong_id, {})

        if filter_book:
            count = book_counts.get(filter_book, 0)
            status = "✓" if count > 0 else "✗"
            print(f"  {status} {strong_id} ({hebrew} — {gloss}): {filter_book}={count}")
        else:
            total = sum(book_counts.values())
            if total == 0:
                print(f"  ✗ {strong_id} ({hebrew} — {gloss}): 0 occurrences in corpus [DATA GAP]")
            else:
                top_books = sorted(book_counts.items(), key=lambda x: -x[1])[:3]
                top_str = ", ".join(f"{b}:{n}" for b, n in top_books)
                print(f"  ✓ {strong_id} ({hebrew} — {gloss}): total={total} (top: {top_str})")


def main():
    parser = argparse.ArgumentParser(description="Verify OT thematic keyword coverage")
    parser.add_argument("--book", help="Filter results to a specific book (e.g. Psalms)")
    parser.add_argument("--theme", help="Show only a specific theme (e.g. suffering)")
    args = parser.parse_args()

    semantic = load_yaml(SEMANTIC_GROUPS_PATH)
    ot_lemmas = load_yaml(OT_LEMMAS_PATH)

    groups = semantic["semantic_groups"]
    lemma_index = build_lemma_index(ot_lemmas)

    themes_to_show = [args.theme] if args.theme else list(groups.keys())

    for theme in themes_to_show:
        if theme not in groups:
            print(f"Theme '{theme}' not found in semantic_groups.yaml")
            continue
        group = groups[theme]
        label = f"Theme: {theme}"
        if args.book:
            label += f" (filtered: {args.book})"
        print(label)
        report_theme(theme, group, lemma_index, filter_book=args.book)
        print()


if __name__ == "__main__":
    main()
