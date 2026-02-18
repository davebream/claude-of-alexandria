#!/usr/bin/env python3
"""
Vocabulary Data Parser for Biblical Segmentation

Provides access to bundled vocabulary frequency data for thematic segmentation.
Follows the same pattern as levinsohn_parser.py and sefaria_paragraphs.py.

Usage:
    python vocabulary_parser.py Philippians
    python vocabulary_parser.py Philippians --theme joy
    python vocabulary_parser.py Genesis --testament ot
    python vocabulary_parser.py Romans --check-clustering
    python vocabulary_parser.py --list-books
    python vocabulary_parser.py --list-themes

Output:
    YAML with lemma frequencies, clustering data, and thematic matches.
"""

import argparse
import json
import sys
import yaml
from pathlib import Path
from typing import Optional, List, Dict

# Path to vocabulary data (relative to script location)
VOCAB_DIR = Path(__file__).parent.parent / "reference" / "vocabulary"

# Thematic keyword mappings (English -> lemmas to check)
# NT uses Greek lemmas, OT uses Strong's numbers
THEMATIC_KEYWORDS = {
    'joy': ['χαίρω', 'χαρά', 'εὐφραίνω'],
    'faith': ['πίστις', 'πιστεύω', 'πιστός'],
    'love': ['ἀγάπη', 'ἀγαπάω', 'φιλέω'],
    'righteousness': ['δικαιοσύνη', 'δίκαιος', 'δικαιόω'],
    'covenant': ['H1285'],  # בְּרִית
    'blessing': ['H1288', 'H1293'],  # ברך family
    'holy': ['H6918', 'H6944'],  # קדוש family
}

# Clustering threshold for "notable" clustering
CLUSTERING_THRESHOLD = 0.6


def load_lemma_data(testament: str = 'nt') -> dict:
    """Load lemma frequency data for testament."""
    filename = f"{testament}_lemmas.yaml"
    filepath = VOCAB_DIR / filename

    if not filepath.exists():
        return {'error': f"Data file not found: {filepath}"}

    with open(filepath, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def load_cluster_data(testament: str = 'nt') -> dict:
    """Load clustering data if available."""
    filename = f"{testament}_clusters.yaml"
    filepath = VOCAB_DIR / filename

    if not filepath.exists():
        return {}

    with open(filepath, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def get_book_vocabulary(book: str, testament: str = 'nt') -> dict:
    """Get vocabulary data for a specific book."""
    data = load_lemma_data(testament)

    if 'error' in data:
        return data

    books = data.get('books', {})
    if book not in books:
        # Try case-insensitive match
        for b in books:
            if b.lower() == book.lower():
                book = b
                break
        else:
            return {
                'error': f"Book not found: {book}",
                'available': list(books.keys())
            }

    return {
        'book': book,
        'testament': testament,
        'data': books[book]
    }


def find_thematic_lemmas(book_data: dict, theme: str) -> List[dict]:
    """Find lemmas matching a thematic keyword."""
    lemmas = book_data.get('lemmas', {})
    theme_lower = theme.lower()

    results = []

    # Check predefined theme mappings
    if theme_lower in THEMATIC_KEYWORDS:
        target_lemmas = THEMATIC_KEYWORDS[theme_lower]
        for lemma in target_lemmas:
            if lemma in lemmas:
                results.append({
                    'lemma': lemma,
                    'total': lemmas[lemma]['total'],
                    'by_chapter': lemmas[lemma]['by_chapter'],
                    'theme_match': theme
                })

    return results


def check_clustering(book: str, testament: str = 'nt') -> dict:
    """Check if book has notable vocabulary clustering."""
    cluster_data = load_cluster_data(testament)

    if not cluster_data:
        return {'has_clustering': False, 'reason': 'No cluster data available'}

    books = cluster_data.get('books', {})

    # Case-insensitive book lookup
    actual_book = None
    for b in books:
        if b.lower() == book.lower():
            actual_book = b
            break

    if actual_book is None:
        return {'has_clustering': False, 'reason': 'No clusters found for book'}

    book_clusters = books[actual_book]
    clusters = book_clusters.get('clusters', [])

    # Check if any cluster exceeds threshold
    notable = [c for c in clusters if c.get('concentration', 0) >= CLUSTERING_THRESHOLD]

    return {
        'has_clustering': len(notable) > 0,
        'notable_count': len(notable),
        'clusters': notable[:5],  # Top 5
        'threshold': CLUSTERING_THRESHOLD
    }


def format_output(data: dict, output_format: str = 'yaml') -> str:
    """Format output as YAML or JSON."""
    if output_format == 'json':
        return json.dumps(data, indent=2, ensure_ascii=False)
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def main():
    parser = argparse.ArgumentParser(
        description='Access vocabulary frequency data for biblical segmentation'
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
        '--theme',
        help='Find lemmas matching thematic keyword (e.g., "joy", "covenant")'
    )
    parser.add_argument(
        '--check-clustering', '-c',
        action='store_true',
        help='Check for notable vocabulary clustering'
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
        help='List available books'
    )
    parser.add_argument(
        '--list-themes',
        action='store_true',
        help='List predefined thematic keywords'
    )

    args = parser.parse_args()

    # List themes
    if args.list_themes:
        print("Predefined thematic keywords:")
        for theme, lemmas in THEMATIC_KEYWORDS.items():
            print(f"  {theme}: {', '.join(lemmas)}")
        return 0

    # List books
    if args.list_books:
        data = load_lemma_data(args.testament)
        if 'error' in data:
            print(data['error'], file=sys.stderr)
            return 1
        print(f"Available {args.testament.upper()} books:")
        for book in data.get('books', {}):
            print(f"  - {book}")
        return 0

    if not args.book:
        parser.error("book name required (or use --list-books)")

    result = get_book_vocabulary(args.book, args.testament)

    if 'error' in result:
        print(format_output(result, args.output), file=sys.stderr)
        return 1

    # Add thematic search if requested
    if args.theme:
        thematic = find_thematic_lemmas(result['data'], args.theme)
        result['thematic_search'] = {
            'theme': args.theme,
            'matches': thematic
        }

    # Add clustering check if requested
    if args.check_clustering:
        clustering = check_clustering(args.book, args.testament)
        result['clustering'] = clustering

    print(format_output(result, args.output))
    return 0


if __name__ == '__main__':
    sys.exit(main())
