#!/usr/bin/env python3
"""
Vocabulary Clustering Analysis

Analyzes lemma frequency data to identify thematic clustering patterns.
A cluster is "notable" when >=60% of occurrences concentrate in a chapter range.

Usage:
    python analyze_clusters.py --input nt_lemmas.yaml --output nt_clusters.yaml
    python analyze_clusters.py --input nt_lemmas.yaml --book Philippians  # Single book
    python analyze_clusters.py --input ot_lemmas.yaml --threshold 0.7  # Higher threshold

The output identifies lemmas with significant clustering, useful for determining
when a thematic segmentation option should be offered to users.

Algorithm:
    1. For each lemma, find all contiguous chapter ranges (2-4 chapters)
    2. Calculate concentration = occurrences_in_range / total_book_occurrences
    3. If best concentration >= threshold (default 60%), mark as "notable cluster"
    4. Output sorted by concentration (highest first)
"""

import argparse
import sys
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def calculate_concentration(
    by_chapter: Dict[int, int],
    chapter_range: Tuple[int, int]
) -> float:
    """
    Calculate what percentage of occurrences fall in a chapter range.

    Args:
        by_chapter: Dict mapping chapter number to occurrence count
        chapter_range: Tuple of (start_chapter, end_chapter) inclusive

    Returns:
        Float between 0.0 and 1.0 representing concentration
    """
    start, end = chapter_range
    total = sum(by_chapter.values())
    if total == 0:
        return 0.0

    in_range = sum(
        count for ch, count in by_chapter.items()
        if start <= ch <= end
    )
    return in_range / total


def find_best_cluster(
    by_chapter: Dict[int, int],
    min_chapters: int = 2,
    max_chapters: int = 4
) -> Optional[Dict]:
    """
    Find the chapter range with highest concentration.

    Searches all contiguous ranges of size min_chapters to max_chapters
    and returns the one with highest concentration of occurrences.

    Args:
        by_chapter: Dict mapping chapter number to occurrence count
        min_chapters: Minimum size of chapter range to consider
        max_chapters: Maximum size of chapter range to consider

    Returns:
        Dict with 'range' (tuple) and 'concentration' (float), or None
    """
    chapters = sorted(by_chapter.keys())
    if len(chapters) < min_chapters:
        return None

    best = {
        'range': None,
        'concentration': 0.0
    }

    # Try all contiguous ranges of min_chapters to max_chapters
    for size in range(min_chapters, min(max_chapters + 1, len(chapters) + 1)):
        for i in range(len(chapters) - size + 1):
            ch_range = (chapters[i], chapters[i + size - 1])
            conc = calculate_concentration(by_chapter, ch_range)
            if conc > best['concentration']:
                best = {
                    'range': ch_range,
                    'concentration': conc
                }

    return best if best['concentration'] > 0 else None


def analyze_book_clusters(
    book_data: Dict,
    threshold: float = 0.6,
    min_occurrences: int = 5
) -> List[Dict]:
    """
    Analyze clustering patterns for a book's lemmas.

    Args:
        book_data: Dict containing 'lemmas' with frequency data
        threshold: Minimum concentration to be considered "notable" (default 0.6 = 60%)
        min_occurrences: Minimum total occurrences for lemma to be analyzed

    Returns:
        List of cluster dicts sorted by concentration (highest first)
    """
    clusters = []

    lemmas = book_data.get('lemmas', {})
    for lemma, data in lemmas.items():
        total = data.get('total', 0)
        by_chapter = data.get('by_chapter', {})

        # Convert chapter keys to int if they're strings (YAML loading quirk)
        by_chapter = {int(k): v for k, v in by_chapter.items()}

        # Skip low-frequency lemmas
        if total < min_occurrences:
            continue

        best = find_best_cluster(by_chapter)
        if best and best['concentration'] >= threshold:
            cluster_info = {
                'lemma': lemma,
                'total': total,
                'cluster_range': f"{best['range'][0]}-{best['range'][1]}",
                'cluster_chapters': list(best['range']),
                'concentration': round(best['concentration'], 3),
            }

            # Add Hebrew word if available (OT data)
            if 'hebrew' in data and data['hebrew']:
                cluster_info['hebrew'] = data['hebrew']

            # Add Strong's number if it's an OT lemma (starts with H)
            if lemma.startswith('H') and lemma[1:].split()[0].isdigit():
                cluster_info['strongs'] = lemma

            clusters.append(cluster_info)

    # Sort by concentration descending
    clusters.sort(key=lambda x: x['concentration'], reverse=True)
    return clusters


def main():
    parser = argparse.ArgumentParser(
        description='Analyze vocabulary clustering patterns in lemma frequency data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Analyze all NT books
    python analyze_clusters.py -i reference/vocabulary/nt_lemmas.yaml -o nt_clusters.yaml

    # Analyze single book
    python analyze_clusters.py -i reference/vocabulary/nt_lemmas.yaml -b Philippians

    # Use stricter threshold (70%)
    python analyze_clusters.py -i reference/vocabulary/nt_lemmas.yaml -t 0.7 -o strict_clusters.yaml
        """
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Input lemmas YAML file (from extract_nt/ot_vocabulary.py)'
    )
    parser.add_argument(
        '--output', '-o',
        help='Output clusters YAML file (if not specified, prints to stdout)'
    )
    parser.add_argument(
        '--book', '-b',
        help='Analyze single book only'
    )
    parser.add_argument(
        '--threshold', '-t',
        type=float,
        default=0.6,
        help='Concentration threshold for "notable" cluster (default: 0.6 = 60%%)'
    )
    parser.add_argument(
        '--min-occurrences', '-n',
        type=int,
        default=5,
        help='Minimum total occurrences to analyze lemma (default: 5)'
    )
    parser.add_argument(
        '--top', '-k',
        type=int,
        default=0,
        help='Show only top K clusters per book (0 = all, default: 0)'
    )

    args = parser.parse_args()

    # Validate threshold
    if not 0 < args.threshold <= 1:
        print(f"Error: threshold must be between 0 and 1, got {args.threshold}",
              file=sys.stderr)
        sys.exit(1)

    # Load input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data or 'books' not in data:
        print(f"Error: Invalid input format - expected 'books' key", file=sys.stderr)
        sys.exit(1)

    result = {
        'metadata': {
            'source_file': input_path.name,
            'threshold': args.threshold,
            'min_occurrences': args.min_occurrences,
            'analysis_date': '2026-01-21',
            'algorithm': 'Best contiguous 2-4 chapter range by concentration'
        },
        'books': {}
    }

    # Determine which books to analyze
    books_to_analyze = data.get('books', {})
    if args.book:
        if args.book not in books_to_analyze:
            # Try case-insensitive match
            for b in books_to_analyze:
                if b.lower() == args.book.lower():
                    args.book = b
                    break
            else:
                print(f"Error: Book not found: {args.book}", file=sys.stderr)
                print(f"Available books: {', '.join(books_to_analyze.keys())}",
                      file=sys.stderr)
                sys.exit(1)
        books_to_analyze = {args.book: books_to_analyze[args.book]}

    # Analyze each book
    total_clusters = 0
    for book_name, book_data in books_to_analyze.items():
        clusters = analyze_book_clusters(
            book_data,
            threshold=args.threshold,
            min_occurrences=args.min_occurrences
        )

        if clusters:
            # Apply --top limit if specified
            if args.top > 0:
                clusters = clusters[:args.top]

            result['books'][book_name] = {
                'notable_clusters': len(clusters),
                'clusters': clusters
            }
            total_clusters += len(clusters)

            # Print summary
            print(f"{book_name}: {len(clusters)} notable clusters")
            for c in clusters[:3]:  # Show top 3
                pct = c['concentration'] * 100
                lemma_display = c.get('hebrew', c['lemma']) if c.get('hebrew') else c['lemma']
                print(f"  {lemma_display}: {pct:.0f}% in chs {c['cluster_range']}")

    # Summary
    print(f"\nTotal: {total_clusters} notable clusters across {len(result['books'])} books")

    # Write output if specified
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            yaml.dump(result, f, allow_unicode=True, default_flow_style=False,
                      sort_keys=False)
        print(f"Output written to {output_path}")
    elif not args.book:
        # If no output file and not single-book mode, print full YAML
        print("\n--- Full Results ---")
        print(yaml.dump(result, allow_unicode=True, default_flow_style=False,
                        sort_keys=False))


if __name__ == '__main__':
    main()
