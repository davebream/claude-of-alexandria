#!/usr/bin/env python3
"""
NT Vocabulary Extraction from MorphGNT

One-time script to extract lemma frequencies from MorphGNT data.
Outputs per-book JSON files with verse-level data.

Usage:
    python extract_nt_vocabulary.py --output-dir reference/vocabulary/nt

Requirements:
    - Clone MorphGNT: git clone https://github.com/morphgnt/sblgnt.git
    - Set MORPHGNT_PATH environment variable or use --morphgnt-path
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

# NT book order and file mapping
# MorphGNT uses format: ##-XXX-morphgnt.txt
NT_BOOKS = {
    'Matthew': '61-Mt-morphgnt',
    'Mark': '62-Mk-morphgnt',
    'Luke': '63-Lk-morphgnt',
    'John': '64-Jn-morphgnt',
    'Acts': '65-Ac-morphgnt',
    'Romans': '66-Ro-morphgnt',
    '1 Corinthians': '67-1Co-morphgnt',
    '2 Corinthians': '68-2Co-morphgnt',
    'Galatians': '69-Ga-morphgnt',
    'Ephesians': '70-Eph-morphgnt',
    'Philippians': '71-Php-morphgnt',
    'Colossians': '72-Col-morphgnt',
    '1 Thessalonians': '73-1Th-morphgnt',
    '2 Thessalonians': '74-2Th-morphgnt',
    '1 Timothy': '75-1Ti-morphgnt',
    '2 Timothy': '76-2Ti-morphgnt',
    'Titus': '77-Tit-morphgnt',
    'Philemon': '78-Phm-morphgnt',
    'Hebrews': '79-Heb-morphgnt',
    'James': '80-Jas-morphgnt',
    '1 Peter': '81-1Pe-morphgnt',
    '2 Peter': '82-2Pe-morphgnt',
    '1 John': '83-1Jn-morphgnt',
    '2 John': '84-2Jn-morphgnt',
    '3 John': '85-3Jn-morphgnt',
    'Jude': '86-Jud-morphgnt',
    'Revelation': '87-Re-morphgnt',
}


def parse_morphgnt_line(line: str) -> Optional[Dict]:
    """
    Parse a single line from MorphGNT format.

    MorphGNT format (space-separated, 7 fields):
    BBCCVV POS PARSING CCAT-TEXT CCAT-WORD NORM-WORD LEMMA
    - BBCCVV: 6-digit reference (book-chapter-verse, e.g., 010101 = Mt 1:1)
    - POS: Part of speech code (e.g., N- for noun)
    - PARSING: Morphological parsing code
    - CCAT-TEXT: CCAT text form
    - CCAT-WORD: CCAT word form
    - NORM-WORD: Normalized word form
    - LEMMA: Dictionary form (last field, index 6)

    Returns:
        Dict with chapter, verse, and lemma, or None if parsing fails
    """
    parts = line.strip().split()
    if len(parts) < 7:
        return None

    reference = parts[0]
    lemma = parts[6]  # Last column is lemma (index 6)

    # Parse reference: BBCCVV format
    # First 2 digits = internal book number (not needed, we process by file)
    # Next 2 digits = chapter
    # Last 2 digits = verse
    if len(reference) < 6:
        return None

    try:
        chapter = int(reference[2:4])
        verse = int(reference[4:6])
    except ValueError:
        return None

    return {
        'chapter': chapter,
        'verse': verse,
        'lemma': lemma
    }


def extract_book_lemmas(morphgnt_path: Path, book_code: str) -> Dict:
    """
    Extract lemma frequencies for a single book with verse-level data.

    Args:
        morphgnt_path: Path to MorphGNT repository root
        book_code: MorphGNT book code (e.g., '71-Php-morphgnt')

    Returns:
        Dict mapping lemma -> {total, verses: ["1:1", "1:2", ...]}
        Verses array preserves duplicates (same verse can appear multiple times)
    """
    book_file = morphgnt_path / f"{book_code}.txt"

    if not book_file.exists():
        print(f"Warning: {book_file} not found", file=sys.stderr)
        return {}

    lemma_data = defaultdict(lambda: {
        'total': 0,
        'verses': []
    })

    with open(book_file, 'r', encoding='utf-8') as f:
        for line in f:
            parsed = parse_morphgnt_line(line)
            if parsed:
                lemma = parsed['lemma']
                chapter = parsed['chapter']
                verse = parsed['verse']
                verse_ref = f"{chapter}:{verse}"

                lemma_data[lemma]['total'] += 1
                lemma_data[lemma]['verses'].append(verse_ref)

    # Convert to regular dict
    return {
        lemma: {
            'total': data['total'],
            'verses': data['verses']
        }
        for lemma, data in lemma_data.items()
    }


def filter_significant_lemmas(lemmas: Dict, min_occurrences: int = 3) -> Dict:
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


def write_book_json(book_name: str, lemmas: Dict, output_dir: Path, metadata: Dict) -> None:
    """
    Write per-book JSON file.

    Args:
        book_name: Name of the book (e.g., "Philippians")
        lemmas: Lemma data for the book
        output_dir: Output directory path
        metadata: Metadata to include in file
    """
    # Create filename: convert "1 Corinthians" -> "1_corinthians.json"
    filename = book_name.lower().replace(' ', '_') + '.json'
    filepath = output_dir / filename

    data = {
        'metadata': metadata,
        'book': book_name,
        'total_lemmas': len(lemmas),
        'lemmas': lemmas
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Written: {filepath}")


def verify_known_values(output_dir: Path) -> None:
    """
    Verify extraction against known values.

    These values are documented in DATA_SOURCES.md and must match.
    """
    print("\nVerification against known values:")

    # Philippians joy vocabulary
    php_file = output_dir / 'philippians.json'
    if php_file.exists():
        with open(php_file, 'r', encoding='utf-8') as f:
            php_data = json.load(f)
        php_lemmas = php_data.get('lemmas', {})

        if 'χαίρω' in php_lemmas:
            actual = php_lemmas['χαίρω']['total']
            expected = 9
            status = "PASS" if actual == expected else "FAIL"
            print(f"  Philippians χαίρω: {actual} (expected: {expected}) [{status}]")
        else:
            print("  Philippians χαίρω: NOT FOUND [FAIL]")

        if 'χαρά' in php_lemmas:
            actual = php_lemmas['χαρά']['total']
            expected = 5
            status = "PASS" if actual == expected else "FAIL"
            print(f"  Philippians χαρά: {actual} (expected: {expected}) [{status}]")
        else:
            print("  Philippians χαρά: NOT FOUND [FAIL]")
    else:
        print("  Philippians file not found [FAIL]")

    # Romans righteousness vocabulary
    rom_file = output_dir / 'romans.json'
    if rom_file.exists():
        with open(rom_file, 'r', encoding='utf-8') as f:
            rom_data = json.load(f)
        rom_lemmas = rom_data.get('lemmas', {})

        if 'δικαιοσύνη' in rom_lemmas:
            actual = rom_lemmas['δικαιοσύνη']['total']
            expected = 33
            status = "PASS" if actual == expected else "FAIL"
            print(f"  Romans δικαιοσύνη: {actual} (expected: {expected}) [{status}]")
        else:
            print("  Romans δικαιοσύνη: NOT FOUND [FAIL]")
    else:
        print("  Romans file not found [FAIL]")


def main():
    parser = argparse.ArgumentParser(
        description='Extract NT lemma frequencies from MorphGNT to per-book JSON files'
    )
    parser.add_argument(
        '--morphgnt-path', '-m',
        default=os.environ.get('MORPHGNT_PATH', './sblgnt'),
        help='Path to MorphGNT repository (default: ./sblgnt or MORPHGNT_PATH env var)'
    )
    parser.add_argument(
        '--output-dir', '-o',
        default='reference/vocabulary/nt',
        help='Output directory for JSON files (default: reference/vocabulary/nt)'
    )
    parser.add_argument(
        '--min-occurrences', '-n',
        type=int,
        default=3,
        help='Minimum occurrences to include lemma (default: 3)'
    )
    parser.add_argument(
        '--book', '-b',
        help='Extract single book only (for testing)'
    )

    args = parser.parse_args()
    morphgnt_path = Path(args.morphgnt_path)

    if not morphgnt_path.exists():
        print(f"Error: MorphGNT path not found: {morphgnt_path}", file=sys.stderr)
        print("Clone with: git clone https://github.com/morphgnt/sblgnt.git", file=sys.stderr)
        sys.exit(1)

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        'source': 'MorphGNT/SBLGNT',
        'repository': 'https://github.com/morphgnt/sblgnt',
        'license': 'CC BY-SA 3.0',
        'extraction_date': '2026-01-21',
        'min_occurrences': args.min_occurrences,
        'format': 'verse-level (duplicates preserved in verses array)'
    }

    # Determine which books to process
    books_to_process = NT_BOOKS
    if args.book:
        if args.book not in NT_BOOKS:
            print(f"Error: Unknown book '{args.book}'", file=sys.stderr)
            print(f"Available books: {', '.join(NT_BOOKS.keys())}", file=sys.stderr)
            sys.exit(1)
        books_to_process = {args.book: NT_BOOKS[args.book]}

    for book_name, book_code in books_to_process.items():
        print(f"Processing {book_name}...")
        lemmas = extract_book_lemmas(morphgnt_path, book_code)

        if not lemmas:
            print(f"  Warning: No lemmas extracted (file may be missing)")
            continue

        filtered = filter_significant_lemmas(lemmas, args.min_occurrences)
        write_book_json(book_name, filtered, output_dir, metadata)
        print(f"  {len(filtered)} significant lemmas (of {len(lemmas)} total)")

    print(f"\nAll files written to {output_dir}/")

    # Run verification checks
    verify_known_values(output_dir)


if __name__ == '__main__':
    main()
