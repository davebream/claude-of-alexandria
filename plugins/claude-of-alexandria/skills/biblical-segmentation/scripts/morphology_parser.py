#!/usr/bin/env python3
"""
Morphology Data Parser for Biblical Segmentation

Provides access to bundled morphological parsing data for exegetical analysis.
Follows the same pattern as vocabulary_parser.py and levinsohn_parser.py.

Usage:
    # NT usage
    python morphology_parser.py Philippians --range 1:1-1:11
    python morphology_parser.py Philippians --range 1:6 --word ἐναρξάμενος
    python morphology_parser.py Philippians --verbs-only --range 1:1-1:11
    python morphology_parser.py --list-books

    # OT usage
    python morphology_parser.py Genesis --testament ot --range 1:1-1:5
    python morphology_parser.py Genesis --testament ot --range 1:2 --pos verb

    # Output formats
    python morphology_parser.py Philippians --range 1:1-1:11 --output json

Output:
    YAML/JSON with verse-level morphological parsing data.
"""

import argparse
import json
import sys
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Path to morphology data (relative to script location)
MORPH_DIR = Path(__file__).parent.parent / "reference" / "morphology"

# NT book name normalization
NT_BOOK_NAMES = {
    'matthew': 'matthew', 'matt': 'matthew',
    'mark': 'mark',
    'luke': 'luke',
    'john': 'john',
    'acts': 'acts',
    'romans': 'romans', 'rom': 'romans',
    '1 corinthians': '1_corinthians', '1corinthians': '1_corinthians',
    '1 cor': '1_corinthians', '1cor': '1_corinthians',
    '2 corinthians': '2_corinthians', '2corinthians': '2_corinthians',
    '2 cor': '2_corinthians', '2cor': '2_corinthians',
    'galatians': 'galatians', 'gal': 'galatians',
    'ephesians': 'ephesians', 'eph': 'ephesians',
    'philippians': 'philippians', 'phil': 'philippians',
    'colossians': 'colossians', 'col': 'colossians',
    '1 thessalonians': '1_thessalonians', '1thess': '1_thessalonians',
    '2 thessalonians': '2_thessalonians', '2thess': '2_thessalonians',
    '1 timothy': '1_timothy', '1tim': '1_timothy',
    '2 timothy': '2_timothy', '2tim': '2_timothy',
    'titus': 'titus', 'tit': 'titus',
    'philemon': 'philemon', 'phlm': 'philemon',
    'hebrews': 'hebrews', 'heb': 'hebrews',
    'james': 'james', 'jas': 'james',
    '1 peter': '1_peter', '1pet': '1_peter',
    '2 peter': '2_peter', '2pet': '2_peter',
    '1 john': '1_john',
    '2 john': '2_john',
    '3 john': '3_john',
    'jude': 'jude',
    'revelation': 'revelation', 'rev': 'revelation',
}

# OT book name normalization
OT_BOOK_NAMES = {
    'genesis': 'genesis', 'gen': 'genesis',
    'exodus': 'exodus', 'exod': 'exodus', 'exo': 'exodus',
    'leviticus': 'leviticus', 'lev': 'leviticus',
    'numbers': 'numbers', 'num': 'numbers',
    'deuteronomy': 'deuteronomy', 'deut': 'deuteronomy',
    'joshua': 'joshua', 'josh': 'joshua',
    'judges': 'judges', 'judg': 'judges',
    'ruth': 'ruth',
    '1 samuel': '1_samuel', '1sam': '1_samuel',
    '2 samuel': '2_samuel', '2sam': '2_samuel',
    '1 kings': '1_kings', '1kgs': '1_kings',
    '2 kings': '2_kings', '2kgs': '2_kings',
    '1 chronicles': '1_chronicles', '1chr': '1_chronicles',
    '2 chronicles': '2_chronicles', '2chr': '2_chronicles',
    'ezra': 'ezra',
    'nehemiah': 'nehemiah', 'neh': 'nehemiah',
    'esther': 'esther', 'esth': 'esther',
    'job': 'job',
    'psalms': 'psalms', 'ps': 'psalms', 'psalm': 'psalms',
    'proverbs': 'proverbs', 'prov': 'proverbs',
    'ecclesiastes': 'ecclesiastes', 'eccl': 'ecclesiastes',
    'song of songs': 'song_of_songs', 'song': 'song_of_songs', 'sos': 'song_of_songs',
    'isaiah': 'isaiah', 'isa': 'isaiah',
    'jeremiah': 'jeremiah', 'jer': 'jeremiah',
    'lamentations': 'lamentations', 'lam': 'lamentations',
    'ezekiel': 'ezekiel', 'ezek': 'ezekiel',
    'daniel': 'daniel', 'dan': 'daniel',
    'hosea': 'hosea', 'hos': 'hosea',
    'joel': 'joel',
    'amos': 'amos',
    'obadiah': 'obadiah', 'obad': 'obadiah',
    'jonah': 'jonah',
    'micah': 'micah', 'mic': 'micah',
    'nahum': 'nahum', 'nah': 'nahum',
    'habakkuk': 'habakkuk', 'hab': 'habakkuk',
    'zephaniah': 'zephaniah', 'zeph': 'zephaniah',
    'haggai': 'haggai', 'hag': 'haggai',
    'zechariah': 'zechariah', 'zech': 'zechariah',
    'malachi': 'malachi', 'mal': 'malachi',
}


def normalize_book_name(book: str, testament: str = 'nt') -> Optional[str]:
    """
    Normalize book name to filename stem.

    Returns:
        Filename stem (e.g., 'philippians', '1_corinthians') or None if not found
    """
    key = book.lower().strip()
    lookup = NT_BOOK_NAMES if testament == 'nt' else OT_BOOK_NAMES
    return lookup.get(key)


def load_book_data(book: str, testament: str = 'nt') -> Dict:
    """Load morphology JSON data for a book."""
    filename = normalize_book_name(book, testament)
    if not filename:
        return {'error': f"Unknown book: '{book}' (testament: {testament})"}

    filepath = MORPH_DIR / testament / f"{filename}.json"
    if not filepath.exists():
        return {'error': f"Morphology data not found: {filepath}"}

    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def parse_verse_ref(ref: str) -> Optional[Tuple[int, int]]:
    """
    Parse a verse reference like '1:6' into (chapter, verse).

    Returns:
        Tuple of (chapter, verse) or None if invalid
    """
    if ':' not in ref:
        return None
    parts = ref.split(':', 1)
    try:
        return (int(parts[0]), int(parts[1]))
    except ValueError:
        return None


def parse_range(range_str: str) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """
    Parse a range like '1:1-1:11' or '1:6' into (start, end) tuples.

    Single verse like '1:6' becomes ((1,6), (1,6)).

    Returns:
        Tuple of (start_ref, end_ref) or None if invalid
    """
    if '-' in range_str:
        parts = range_str.split('-', 1)
        start = parse_verse_ref(parts[0].strip())
        end = parse_verse_ref(parts[1].strip())
        if start and end:
            return (start, end)
        return None
    else:
        ref = parse_verse_ref(range_str.strip())
        if ref:
            return (ref, ref)
        return None


def verse_in_range(verse_ref: str, start: Tuple[int, int], end: Tuple[int, int]) -> bool:
    """
    Check if a verse reference (e.g., '1:6') falls within the given range.
    """
    parsed = parse_verse_ref(verse_ref)
    if not parsed:
        return False

    ch, vs = parsed
    start_ch, start_vs = start
    end_ch, end_vs = end

    if ch < start_ch or ch > end_ch:
        return False
    if ch == start_ch and vs < start_vs:
        return False
    if ch == end_ch and vs > end_vs:
        return False

    return True


def filter_words(words: List[Dict], pos_filter: Optional[str] = None,
                 word_filter: Optional[str] = None) -> List[Dict]:
    """
    Filter word list by part of speech and/or word form.

    Args:
        words: List of word dicts
        pos_filter: POS to filter by (e.g., 'verb', 'noun')
        word_filter: Greek/Hebrew word or lemma to filter by

    Returns:
        Filtered list
    """
    result = words

    if pos_filter:
        result = [w for w in result if w.get('pos') == pos_filter]

    if word_filter:
        result = [
            w for w in result
            if word_filter in (w.get('text', ''), w.get('normalized', ''),
                                w.get('lemma', ''))
        ]

    return result


def get_morphology_for_range(book: str, verse_range: str,
                              testament: str = 'nt',
                              pos_filter: Optional[str] = None,
                              word_filter: Optional[str] = None) -> Dict:
    """
    Get morphological data for a passage range.

    Args:
        book: Book name (e.g., 'Philippians', 'Genesis')
        verse_range: Range string (e.g., '1:1-1:11' or '1:6')
        testament: 'nt' or 'ot'
        pos_filter: Filter by POS (e.g., 'verb', 'noun')
        word_filter: Filter by word/lemma

    Returns:
        Dict with passage metadata and word-level morphological data
    """
    data = load_book_data(book, testament)
    if 'error' in data:
        return data

    parsed_range = parse_range(verse_range)
    if not parsed_range:
        return {'error': f"Invalid range: '{verse_range}'. Use format like '1:1-1:11' or '1:6'"}

    start, end = parsed_range
    all_verses = data.get('verses', {})

    # Collect words in range
    result_words = []
    verses_found = []

    for verse_ref, words in all_verses.items():
        if verse_in_range(verse_ref, start, end):
            verses_found.append(verse_ref)
            filtered = filter_words(words, pos_filter, word_filter)
            for word in filtered:
                result_words.append({'verse': verse_ref, **word})

    # Sort by verse reference
    def sort_key(w):
        ref = parse_verse_ref(w['verse'])
        return ref if ref else (0, 0)

    result_words.sort(key=sort_key)

    # Build summary
    total = len(result_words)
    by_pos = {}
    for w in result_words:
        pos = w.get('pos', 'unknown')
        by_pos[pos] = by_pos.get(pos, 0) + 1

    return {
        'book': data.get('book', book),
        'testament': testament,
        'range': verse_range,
        'verses_found': len(verses_found),
        'words': result_words,
        'summary': {
            'total_words': total,
            'by_pos': by_pos,
        }
    }


def format_output(data: Dict, output_format: str = 'yaml') -> str:
    """Format output as YAML or JSON."""
    if output_format == 'json':
        return json.dumps(data, indent=2, ensure_ascii=False)
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def list_available_books(testament: str = 'nt') -> List[str]:
    """List available books with morphology data."""
    morph_dir = MORPH_DIR / testament
    if not morph_dir.exists():
        return []

    files = sorted(morph_dir.glob('*.json'))
    return [f.stem for f in files]


def main():
    parser = argparse.ArgumentParser(
        description='Access morphological parsing data for biblical exegesis'
    )
    parser.add_argument(
        'book',
        nargs='?',
        help='Book name (e.g., "Philippians", "Genesis")'
    )
    parser.add_argument(
        '--testament', '-t',
        choices=['nt', 'ot'],
        default='nt',
        help='Testament (default: nt)'
    )
    parser.add_argument(
        '--range', '-r',
        help='Verse range (e.g., "1:1-1:11" or "1:6")'
    )
    parser.add_argument(
        '--word', '-w',
        help='Filter by specific word or lemma (Greek/Hebrew)'
    )
    parser.add_argument(
        '--pos', '-p',
        help='Filter by part of speech (e.g., "verb", "noun", "adjective")'
    )
    parser.add_argument(
        '--verbs-only',
        action='store_true',
        help='Show only verbs (shorthand for --pos verb)'
    )
    parser.add_argument(
        '--output', '-o',
        choices=['yaml', 'json'],
        default='yaml',
        help='Output format (default: yaml)'
    )
    parser.add_argument(
        '--list-books', '-l',
        action='store_true',
        help='List available books with morphology data'
    )

    args = parser.parse_args()

    if args.list_books:
        books = list_available_books(args.testament)
        print(f"Available {args.testament.upper()} books with morphology data:")
        for book in books:
            print(f"  - {book}")
        return 0

    if not args.book:
        parser.error("book name required (or use --list-books)")

    if not args.range:
        parser.error("--range required (e.g., --range 1:1-1:11)")

    pos_filter = args.pos
    if args.verbs_only:
        pos_filter = 'verb'

    result = get_morphology_for_range(
        book=args.book,
        verse_range=args.range,
        testament=args.testament,
        pos_filter=pos_filter,
        word_filter=args.word,
    )

    if 'error' in result:
        print(format_output(result, args.output), file=sys.stderr)
        return 1

    print(format_output(result, args.output))
    return 0


if __name__ == '__main__':
    sys.exit(main())
