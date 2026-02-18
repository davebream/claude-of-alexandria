#!/usr/bin/env python3
"""
OT Vocabulary Extraction from OpenScriptures morphhb

One-time script to extract lemma frequencies from Hebrew morphological data.
Outputs per-book JSON files with verse-level data.

Usage:
    python extract_ot_vocabulary.py --output reference/vocabulary/ot

Requirements:
    - Clone morphhb: git clone https://github.com/openscriptures/morphhb.git
    - Set MORPHHB_PATH environment variable or use --morphhb-path
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

# OT book order and file mapping (OSIS abbreviations used by morphhb)
OT_BOOKS = {
    'Genesis': 'Gen',
    'Exodus': 'Exod',
    'Leviticus': 'Lev',
    'Numbers': 'Num',
    'Deuteronomy': 'Deut',
    'Joshua': 'Josh',
    'Judges': 'Judg',
    'Ruth': 'Ruth',
    '1 Samuel': '1Sam',
    '2 Samuel': '2Sam',
    '1 Kings': '1Kgs',
    '2 Kings': '2Kgs',
    '1 Chronicles': '1Chr',
    '2 Chronicles': '2Chr',
    'Ezra': 'Ezra',
    'Nehemiah': 'Neh',
    'Esther': 'Esth',
    'Job': 'Job',
    'Psalms': 'Ps',
    'Proverbs': 'Prov',
    'Ecclesiastes': 'Eccl',
    'Song of Songs': 'Song',
    'Isaiah': 'Isa',
    'Jeremiah': 'Jer',
    'Lamentations': 'Lam',
    'Ezekiel': 'Ezek',
    'Daniel': 'Dan',
    'Hosea': 'Hos',
    'Joel': 'Joel',
    'Amos': 'Amos',
    'Obadiah': 'Obad',
    'Jonah': 'Jonah',
    'Micah': 'Mic',
    'Nahum': 'Nah',
    'Habakkuk': 'Hab',
    'Zephaniah': 'Zeph',
    'Haggai': 'Hag',
    'Zechariah': 'Zech',
    'Malachi': 'Mal',
}

# OSIS namespace used in morphhb XML files
OSIS_NS = {'osis': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}


def parse_strongs_from_lemma(lemma_attr: str) -> list:
    """
    Extract Strong's numbers from the lemma attribute.

    The lemma attribute in morphhb uses formats like:
    - "430" (single number, = H430)
    - "b/7225" (prefix + number, extract 7225)
    - "1254 a" (number with variant letter)
    - "c/d/776" (multiple prefixes + number)

    Args:
        lemma_attr: The lemma attribute value from the XML

    Returns:
        List of Strong's numbers (e.g., ['H430', 'H7225'])
    """
    if not lemma_attr:
        return []

    result = []

    # The lemma can have prefixes separated by /
    # Extract all numeric parts (Strong's numbers)
    # Pattern: digit sequence, optionally followed by space and a-z suffix
    for part in lemma_attr.split('/'):
        # Handle formats like "430", "1254 a", "7225"
        # Strip any letter prefixes and extract the number
        match = re.match(r'(\d+)\s*([a-z])?', part.strip())
        if match:
            num = match.group(1)
            suffix = match.group(2) or ''
            strongs = f"H{num}{suffix}"
            result.append(strongs)

    return result


def extract_book_lemmas_by_verse(morphhb_path: Path, book_code: str) -> Dict:
    """
    Extract lemma frequencies with verse-level data.

    Args:
        morphhb_path: Path to morphhb repository root
        book_code: OSIS book code (e.g., 'Gen', 'Exod')

    Returns:
        Dict mapping Strong's number -> {total, hebrew, verses: [list of verse refs]}
    """
    book_file = morphhb_path / 'wlc' / f"{book_code}.xml"

    if not book_file.exists():
        print(f"Warning: {book_file} not found", file=sys.stderr)
        return {}

    try:
        tree = ET.parse(book_file)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"Warning: Failed to parse {book_file}: {e}", file=sys.stderr)
        return {}

    lemma_data = defaultdict(lambda: {
        'total': 0,
        'hebrew': None,
        'verses': []
    })

    # Find all verse elements
    for verse in root.findall('.//osis:verse', OSIS_NS):
        osis_id = verse.get('osisID', '')
        if not osis_id:
            continue

        # Parse chapter and verse from osisID (format: "Book.Chapter.Verse")
        parts = osis_id.split('.')
        if len(parts) < 3:
            continue

        try:
            chapter = int(parts[1])
            verse_num = int(parts[2])
            verse_ref = f"{chapter}:{verse_num}"
        except ValueError:
            continue

        # Find all words within this verse
        for w in verse.findall('.//osis:w', OSIS_NS):
            lemma_attr = w.get('lemma', '')
            strongs_numbers = parse_strongs_from_lemma(lemma_attr)

            if not strongs_numbers:
                continue

            hebrew_word = w.text or ''

            for strongs in strongs_numbers:
                lemma_data[strongs]['total'] += 1
                lemma_data[strongs]['verses'].append(verse_ref)
                if lemma_data[strongs]['hebrew'] is None and hebrew_word:
                    lemma_data[strongs]['hebrew'] = hebrew_word

    # If verse-based extraction found nothing, try direct word search
    if not lemma_data:
        # Fallback: iterate through all words and parse their osisID directly
        for w in root.findall('.//osis:w', OSIS_NS):
            lemma_attr = w.get('lemma', '')
            strongs_numbers = parse_strongs_from_lemma(lemma_attr)

            if not strongs_numbers:
                continue

            # Try to get chapter and verse from word's osisID
            word_id = w.get('osisID', '')
            if not word_id:
                # Try n attribute which sometimes contains reference info
                word_id = w.get('n', '')

            verse_ref = None
            if word_id:
                parts = word_id.split('.')
                if len(parts) >= 3:
                    try:
                        chapter = int(parts[1])
                        verse_num = int(parts[2])
                        verse_ref = f"{chapter}:{verse_num}"
                    except ValueError:
                        pass

            # For words without verse info, use 1:1 as fallback
            if verse_ref is None:
                verse_ref = "1:1"

            hebrew_word = w.text or ''

            for strongs in strongs_numbers:
                lemma_data[strongs]['total'] += 1
                lemma_data[strongs]['verses'].append(verse_ref)
                if lemma_data[strongs]['hebrew'] is None and hebrew_word:
                    lemma_data[strongs]['hebrew'] = hebrew_word

    # Convert to serializable dict
    return {
        strongs: {
            'total': data['total'],
            'hebrew': data['hebrew'] or '',
            'verses': data['verses']
        }
        for strongs, data in lemma_data.items()
    }


def filter_significant_lemmas(lemmas: Dict, min_occurrences: int = 5) -> Dict:
    """
    Filter to lemmas with significant occurrence counts.

    Args:
        lemmas: Dict of lemma data
        min_occurrences: Minimum total occurrences to include

    Returns:
        Filtered dict
    """
    return {
        lemma: data
        for lemma, data in lemmas.items()
        if data['total'] >= min_occurrences
    }


def verify_known_values(genesis_data: Dict, exodus_data: Dict) -> None:
    """
    Verify extraction against known values.

    These values are documented in DATA_SOURCES.md and must approximately match.
    Note: Exact counts may vary slightly based on text tradition and encoding.
    """
    print("\nVerification against known values:")

    # Genesis vocabulary
    gen_lemmas = genesis_data.get('lemmas', {})

    # H430 = אֱלֹהִים (Elohim/God) - expected ~217 in Genesis
    if 'H430' in gen_lemmas:
        actual = gen_lemmas['H430']['total']
        expected_min, expected_max = 200, 230  # Allow some variance
        status = "PASS" if expected_min <= actual <= expected_max else "CHECK"
        print(f"  Genesis H430 (אֱלֹהִים): {actual} (expected: ~217) [{status}]")
    else:
        print("  Genesis H430 (אֱלֹהִים): NOT FOUND [FAIL]")

    # H1285 = בְּרִית (covenant) - expected ~27 in Genesis
    if 'H1285' in gen_lemmas:
        actual = gen_lemmas['H1285']['total']
        expected_min, expected_max = 25, 30  # Allow some variance
        status = "PASS" if expected_min <= actual <= expected_max else "CHECK"
        print(f"  Genesis H1285 (בְּרִית): {actual} (expected: ~27) [{status}]")
    else:
        print("  Genesis H1285 (בְּרִית): NOT FOUND [FAIL]")

    # Exodus H3068 = יהוה (YHWH) - high frequency book for divine name
    exod_lemmas = exodus_data.get('lemmas', {})
    if 'H3068' in exod_lemmas:
        actual = exod_lemmas['H3068']['total']
        print(f"  Exodus H3068 (יהוה): {actual}")
    else:
        print("  Exodus H3068 (יהוה): NOT FOUND [INFO]")


def normalize_book_name(book_name: str) -> str:
    """Convert book name to filename-safe lowercase format."""
    return book_name.lower().replace(' ', '_')


def main():
    parser = argparse.ArgumentParser(
        description='Extract OT lemma frequencies from OpenScriptures morphhb'
    )
    parser.add_argument(
        '--morphhb-path', '-m',
        default=os.environ.get('MORPHHB_PATH', './morphhb'),
        help='Path to morphhb repository (default: ./morphhb or MORPHHB_PATH env var)'
    )
    parser.add_argument(
        '--output', '-o',
        default='reference/vocabulary/ot',
        help='Output directory (default: reference/vocabulary/ot)'
    )
    parser.add_argument(
        '--min-occurrences', '-n',
        type=int,
        default=5,
        help='Minimum occurrences to include lemma (default: 5)'
    )
    parser.add_argument(
        '--book', '-b',
        help='Extract single book only (for testing)'
    )

    args = parser.parse_args()
    morphhb_path = Path(args.morphhb_path)

    if not morphhb_path.exists():
        print(f"Error: morphhb path not found: {morphhb_path}", file=sys.stderr)
        print("Clone with: git clone https://github.com/openscriptures/morphhb.git", file=sys.stderr)
        sys.exit(1)

    # Verify wlc directory exists
    wlc_path = morphhb_path / 'wlc'
    if not wlc_path.exists():
        print(f"Error: wlc directory not found in {morphhb_path}", file=sys.stderr)
        print("Ensure the morphhb repository is properly cloned.", file=sys.stderr)
        sys.exit(1)

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which books to process
    books_to_process = OT_BOOKS
    if args.book:
        if args.book not in OT_BOOKS:
            print(f"Error: Unknown book '{args.book}'", file=sys.stderr)
            print(f"Available books: {', '.join(OT_BOOKS.keys())}", file=sys.stderr)
            sys.exit(1)
        books_to_process = {args.book: OT_BOOKS[args.book]}

    genesis_data = None
    exodus_data = None

    for book_name, book_code in books_to_process.items():
        print(f"Processing {book_name}...")
        lemmas = extract_book_lemmas_by_verse(morphhb_path, book_code)

        if not lemmas:
            print(f"  Warning: No lemmas extracted (file may be missing or empty)")
            continue

        filtered = filter_significant_lemmas(lemmas, args.min_occurrences)

        # Build JSON structure matching NT format
        book_data = {
            'metadata': {
                'source': 'OpenScriptures/morphhb',
                'repository': 'https://github.com/openscriptures/morphhb',
                'license': 'CC BY 4.0',
                'text_base': 'Westminster Leningrad Codex',
                'extraction_date': '2026-01-21',
                'min_occurrences': args.min_occurrences,
                'format': 'verse-level (duplicates preserved in verses array)'
            },
            'book': book_name,
            'total_lemmas': len(filtered),
            'lemmas': filtered
        }

        # Write per-book JSON file
        filename = f"{normalize_book_name(book_name)}.json"
        output_file = output_dir / filename

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(book_data, f, ensure_ascii=False, indent=2)

        print(f"  {len(filtered)} significant lemmas (of {len(lemmas)} total)")
        print(f"  Written to {output_file}")

        # Store data for verification
        if book_name == 'Genesis':
            genesis_data = book_data
        elif book_name == 'Exodus':
            exodus_data = book_data

    print(f"\nAll books written to {output_dir}/")

    # Run verification checks if we have the data
    if genesis_data and exodus_data:
        verify_known_values(genesis_data, exodus_data)
    elif genesis_data:
        verify_known_values(genesis_data, {})


if __name__ == '__main__':
    main()
