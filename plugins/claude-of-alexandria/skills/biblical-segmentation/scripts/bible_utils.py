#!/usr/bin/env python3
"""
Shared utilities for biblical text processing scripts.

Provides common functionality for book name normalization, JSON loading,
and error handling used by sefaria_paragraphs.py and levinsohn_parser.py.
"""

import json
import sys
from pathlib import Path
from typing import Optional


# Book name variations for normalization
# Maps lowercase book names to list of acceptable variations
BOOK_VARIATIONS: dict[str, list[str]] = {
    'matthew': ['Matt', 'Matthew'],
    'matt': ['Matt', 'Matthew'],
    'mark': ['Mark'],
    'luke': ['Luke'],
    'john': ['John'],
    'acts': ['Acts'],
    'romans': ['Rom', 'Romans'],
    'rom': ['Rom', 'Romans'],
    '1 corinthians': ['1 Cor', '1Cor', '1 Corinthians'],
    '1 cor': ['1 Cor', '1Cor', '1 Corinthians'],
    '2 corinthians': ['2 Cor', '2Cor', '2 Corinthians'],
    '2 cor': ['2 Cor', '2Cor', '2 Corinthians'],
    'galatians': ['Gal', 'Galatians'],
    'gal': ['Gal', 'Galatians'],
    'ephesians': ['Eph', 'Ephesians'],
    'eph': ['Eph', 'Ephesians'],
    'philippians': ['Phil', 'Philippians'],
    'phil': ['Phil', 'Philippians'],
    'colossians': ['Col', 'Colossians'],
    'col': ['Col', 'Colossians'],
    '1 thessalonians': ['1 Thess', '1Thess', '1 Thessalonians'],
    '1 thess': ['1 Thess', '1Thess', '1 Thessalonians'],
    '2 thessalonians': ['2 Thess', '2Thess', '2 Thessalonians'],
    '2 thess': ['2 Thess', '2Thess', '2 Thessalonians'],
    '1 timothy': ['1 Tim', '1Tim', '1 Timothy'],
    '1 tim': ['1 Tim', '1Tim', '1 Timothy'],
    '2 timothy': ['2 Tim', '2Tim', '2 Timothy'],
    '2 tim': ['2 Tim', '2Tim', '2 Timothy'],
    'titus': ['Titus'],
    'philemon': ['Phlm', 'Philemon'],
    'phlm': ['Phlm', 'Philemon'],
    'hebrews': ['Heb', 'Hebrews'],
    'heb': ['Heb', 'Hebrews'],
    'james': ['Jas', 'James'],
    'jas': ['Jas', 'James'],
    '1 peter': ['1 Pet', '1Pet', '1 Peter'],
    '1 pet': ['1 Pet', '1Pet', '1 Peter'],
    '2 peter': ['2 Pet', '2Pet', '2 Peter'],
    '2 pet': ['2 Pet', '2Pet', '2 Peter'],
    '1 john': ['1 John', '1John'],
    '2 john': ['2 John', '2John'],
    '3 john': ['3 John', '3John'],
    'jude': ['Jude'],
    'revelation': ['Rev', 'Revelation'],
    'rev': ['Rev', 'Revelation'],
}


def normalize_book_name(book: str) -> str:
    """
    Convert book name to standardized slug format.

    Args:
        book: Book name in any format (e.g., "Genesis", "1 Samuel", "Matt")

    Returns:
        Lowercase slug with hyphens (e.g., "genesis", "1-samuel", "matthew")

    Examples:
        >>> normalize_book_name("Genesis")
        'genesis'
        >>> normalize_book_name("1 Samuel")
        '1-samuel'
    """
    return book.lower().replace(" ", "-")


def get_book_variations(book: str) -> list[str]:
    """
    Get list of acceptable name variations for a book.

    Args:
        book: Book name (e.g., "Mark", "Matthew", "1 Cor")

    Returns:
        List of acceptable variations, or [book] if no variations defined

    Examples:
        >>> get_book_variations("Matthew")
        ['Matt', 'Matthew']
        >>> get_book_variations("Mark")
        ['Mark']
    """
    book_lower = book.lower()
    return BOOK_VARIATIONS.get(book_lower, [book])


def load_json_file(file_path: Path) -> Optional[dict]:
    """
    Load JSON data from a file with robust error handling.

    Args:
        file_path: Path to JSON file

    Returns:
        Dict with JSON data, or None if file not found or invalid

    Error Handling:
        - File not found: Prints error to stderr, returns None
        - JSON parse error: Prints error to stderr, returns None
        - Other errors: Prints error to stderr, returns None
    """
    if not file_path.exists():
        print(f"Error: Data file not found: {file_path}", file=sys.stderr)
        return None

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {file_path}: {e}", file=sys.stderr)
        return None

    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)
        return None


def filter_references_by_book(references: list[dict], book: str) -> list[dict]:
    """
    Filter a list of verse references to only those matching a specific book.

    Args:
        references: List of dicts with 'verse' field containing references
        book: Book name to filter by (e.g., "Mark", "John")

    Returns:
        Filtered list containing only references matching the book

    Examples:
        >>> refs = [{'verse': 'Mark 1:1'}, {'verse': 'Luke 2:1'}]
        >>> filter_references_by_book(refs, 'Mark')
        [{'verse': 'Mark 1:1'}]
    """
    valid_prefixes = get_book_variations(book)

    filtered = []
    for ref in references:
        verse = ref.get('verse', '')
        if any(verse.startswith(prefix + ' ') for prefix in valid_prefixes):
            filtered.append(ref)

    return filtered


def validate_verse_reference(verse_ref: str) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Validate and parse a verse reference in "chapter:verse" format.

    Args:
        verse_ref: Verse reference string (e.g., "1:1", "23:14")

    Returns:
        Tuple of (is_valid, chapter, verse)
        - is_valid: True if reference is valid
        - chapter: Chapter number as string, or None if invalid
        - verse: Verse number as string, or None if invalid

    Examples:
        >>> validate_verse_reference("1:1")
        (True, '1', '1')
        >>> validate_verse_reference("invalid")
        (False, None, None)
        >>> validate_verse_reference("3:")
        (False, None, None)
    """
    if ':' not in verse_ref:
        return (False, None, None)

    parts = verse_ref.split(':', 1)
    if len(parts) != 2:
        return (False, None, None)

    chapter, verse = parts

    if not chapter.isdigit() or not verse.isdigit():
        return (False, None, None)

    return (True, chapter, verse)
