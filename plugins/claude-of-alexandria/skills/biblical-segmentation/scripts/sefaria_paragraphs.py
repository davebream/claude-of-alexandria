#!/usr/bin/env python3
"""
Masoretic Paragraph Marker Extractor

Loads OT Masoretic paragraph markers from static JSON files.
Previously fetched from Sefaria API; now uses local static data.

Usage:
    python sefaria_paragraphs.py Genesis
    python sefaria_paragraphs.py "1 Samuel"
    python sefaria_paragraphs.py Isaiah --output json

Output:
    List of verse references where paragraph breaks occur, with break type.
"""
# ARCHIVED: This script has been superseded by the claude-of-alexandria-mcp MCP server.
# Retained as reference for data format and ETL validation baseline.
# See: plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts


import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from bible_utils import (
    normalize_book_name,
    load_json_file,
    validate_verse_reference
)


def load_book_data(book: str) -> Optional[dict]:
    """
    Load JSON data for a book from static files.

    Args:
        book: Book name (e.g., "Genesis", "1 Samuel")

    Returns:
        Dict with 'petuchot' and 'setumot' lists, or None if not found.
    """
    script_dir = Path(__file__).parent
    json_file = script_dir.parent / "reference" / "masoretic" / f"{normalize_book_name(book)}.json"
    return load_json_file(json_file)


def get_paragraph_breaks(book: str) -> list[dict]:
    """
    Load paragraph breaks from static YAML data.

    Args:
        book: Book name (e.g., "Genesis", "1 Samuel")

    Returns:
        List of paragraph break records with reference, chapter, verse, type.
    """
    data = load_book_data(book)
    if data is None:
        return []

    breaks = []
    skipped = 0

    # Process petuchot
    for verse_ref in data.get('petuchot', []):
        try:
            is_valid, chapter, verse = validate_verse_reference(verse_ref)

            if not is_valid:
                print(f"Warning: Skipping malformed petuchah reference '{verse_ref}'", file=sys.stderr)
                skipped += 1
                continue

            breaks.append({
                'reference': f"{book} {verse_ref}",
                'chapter': int(chapter),
                'verse': int(verse),
                'type': 'petuchah'
            })
        except Exception as e:
            print(f"Warning: Skipping petuchah reference '{verse_ref}': {e}", file=sys.stderr)
            skipped += 1

    # Process setumot
    for verse_ref in data.get('setumot', []):
        try:
            is_valid, chapter, verse = validate_verse_reference(verse_ref)

            if not is_valid:
                print(f"Warning: Skipping malformed setumah reference '{verse_ref}'", file=sys.stderr)
                skipped += 1
                continue

            breaks.append({
                'reference': f"{book} {verse_ref}",
                'chapter': int(chapter),
                'verse': int(verse),
                'type': 'setumah'
            })
        except Exception as e:
            print(f"Warning: Skipping setumah reference '{verse_ref}': {e}", file=sys.stderr)
            skipped += 1

    # Sort by chapter then verse
    breaks.sort(key=lambda x: (x['chapter'], x['verse']))

    if skipped > 0:
        print(f"Skipped {skipped} malformed entries", file=sys.stderr)

    return breaks


def format_output(breaks: list[dict], output_format: str) -> str:
    """Format the breaks for output."""
    if output_format == 'json':
        return json.dumps(breaks, indent=2)

    # Default: human-readable
    lines = []
    current_chapter = None

    for b in breaks:
        if b['chapter'] != current_chapter:
            if current_chapter is not None:
                lines.append('')
            current_chapter = b['chapter']
            lines.append(f"Chapter {current_chapter}:")

        marker_symbol = 'פ' if b['type'] == 'petuchah' else 'ס'
        lines.append(f"  {b['reference']} ({marker_symbol} {b['type']})")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Extract paragraph markers from OT books (static data)'
    )
    parser.add_argument('book', help='Book name (e.g., "Genesis", "1 Samuel")')
    parser.add_argument(
        '--output', '-o',
        choices=['text', 'json'],
        default='text',
        help='Output format (default: text)'
    )

    args = parser.parse_args()

    print(f"Loading paragraph markers for {args.book}...", file=sys.stderr)
    breaks = get_paragraph_breaks(args.book)

    if not breaks:
        print(f"No paragraph markers found for {args.book}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(breaks)} paragraph markers", file=sys.stderr)
    print(format_output(breaks, args.output))


if __name__ == '__main__':
    main()
