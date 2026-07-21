#!/usr/bin/env python3
"""
Levinsohn GNT Discourse Features Loader

Loads and filters verse references from generated Levinsohn JSON files.
Used to identify Greek discourse markers for NT segmentation.

Usage:
    python levinsohn_parser.py Mark
    python levinsohn_parser.py John --features historical_present,point_of_departure
    python levinsohn_parser.py --list-features  # List all available features

Output:
    JSON with verse references for each discourse feature type.
"""
# ARCHIVED: This runtime loader has been superseded by the claude-of-alexandria-mcp MCP server.
# Retained as a reference reader and ETL validation baseline. It does not
# generate the bundled JSON; see extract_levinsohn_discourse.py for that.
# See: plugins/claude-of-alexandria/servers/claude-of-alexandria-mcp/scripts/build-db.ts


import argparse
import json
import sys
from pathlib import Path
from typing import Optional, List, Dict

from bible_utils import (
    load_json_file,
    filter_references_by_book
)

# Path to Levinsohn JSON files (relative to script location)
LEVINSOHN_DIR = Path(__file__).parent.parent / "reference" / "levinsohn"

# Feature files relevant to segmentation (per design doc)
SEGMENTATION_FEATURES = {
    "historical_present": "Historical_Present.json",
    "left_dislocation": "Left-Dislocation.json",
    "referential_pod": "Referential_PoD.json",
    "situational_pod": "Situational_PoD.json",
    "reported_speech": "Reported_Speech.json",
    "tail_head_linkage": "Tail-Head_linkage.json",
}

# All available feature files
ALL_FEATURES = {
    "ambiguous": "Ambiguous.json",
    "annotations": "Annotations.json",
    "appositive": "Appositive.json",
    "articular_pronoun": "Articular_Pronoun.json",
    "cataphoric_focus": "Cataphoric_Focus.json",
    "cataphoric_referent": "Cataphoric_referent.json",
    "constituent_negation": "Constituent_Negation.json",
    "dfe": "DFE.json",
    "embedded_rep_speech": "EmbeddedRepSpeech.json",
    "embedded_dfe": "Embedded_DFE.json",
    "embedded_focus_plus": "Embedded_Focus+.json",
    "focus_plus": "Focus+.json",
    "futuristic_present": "Futuristic_Present.json",
    "highlighter": "Highlighter.json",
    "historical_perfect": "Historical_Perfect.json",
    "historical_present": "Historical_Present.json",
    "left_dislocation": "Left-Dislocation.json",
    "main_clauses": "Main_clauses.json",
    "noun_incorporation": "Noun_Incorporation.json",
    "ot_quotes": "OT_quotes.json",
    "over_encoding": "Over-encoding.json",
    "postposed_them_subject": "Postposed_them_subject.json",
    "referential_pod_plus": "Referential_PoD+.json",
    "referential_pod": "Referential_PoD.json",
    "reported_speech": "Reported_Speech.json",
    "right_dislocated": "Right-Dislocated.json",
    "situational_pod": "Situational_PoD.json",
    "specific_circumstance": "Specific_Circumstance.json",
    "split_focal": "Split_Focal.json",
    "tail_head_linkage": "Tail-Head_linkage.json",
    "thematic_prominence": "Thematic_Prominence.json",
    "topical_genitive": "Topical_Genitive.json",
    "verb_focus_plus": "Verb_Focus+.json",
}


def parse_feature_json(json_path: Path) -> List[Dict[str, object]]:
    """
    Parse a Levinsohn JSON file and extract verse references.

    Returns:
        List of dicts with keys: verse, word_index, word, type
    """
    data = load_json_file(json_path)
    if data is None:
        return []

    return data.get('references', [])


def get_discourse_features(book: str, features: Optional[List[str]] = None) -> Dict:
    """
    Get discourse features for a specific NT book.

    Args:
        book: Book name (e.g., "Mark", "John")
        features: List of feature names to extract (default: segmentation features)

    Returns:
        Dict with feature types as keys and list of verse references as values
    """
    # Determine which features to parse
    if features is None:
        feature_files = SEGMENTATION_FEATURES
    else:
        feature_files = {f: ALL_FEATURES[f] for f in features if f in ALL_FEATURES}

    # Check if Levinsohn directory exists
    if not LEVINSOHN_DIR.exists():
        return {
            "error": f"Levinsohn directory not found: {LEVINSOHN_DIR}",
            "book": book,
            "features_requested": list(feature_files.keys()),
            "note": "Download JSON files from https://github.com/biblicalhumanities/levinsohn/tree/master/LGNTDF"
        }

    # Parse each feature file
    result = {
        "book": book,
        "features": {},
        "summary": {}
    }

    for feature_name, json_file in feature_files.items():
        json_path = LEVINSOHN_DIR / json_file

        if not json_path.exists():
            result["features"][feature_name] = {
                "error": f"Feature file not found: {json_file}"
            }
            continue

        # Parse JSON and filter by book
        all_refs = parse_feature_json(json_path)
        book_refs = filter_references_by_book(all_refs, book)

        # Store results
        result["features"][feature_name] = book_refs
        result["summary"][feature_name] = len(book_refs)

    return result


def format_output(data: Dict, output_format: str) -> str:
    """Format the output."""
    if output_format == 'json':
        return json.dumps(data, indent=2, ensure_ascii=False)

    # Human-readable text format
    lines = []
    lines.append(f"Levinsohn Discourse Features: {data['book']}")
    lines.append("=" * 60)
    lines.append("")

    if "error" in data:
        lines.append(f"ERROR: {data['error']}")
        return '\n'.join(lines)

    # Summary
    lines.append("Summary:")
    for feature, count in data.get('summary', {}).items():
        lines.append(f"  {feature}: {count} occurrences")
    lines.append("")

    # Detailed references
    for feature_name, refs in data.get('features', {}).items():
        if isinstance(refs, dict) and "error" in refs:
            lines.append(f"{feature_name}: {refs['error']}")
            continue

        lines.append(f"{feature_name.replace('_', ' ').title()}:")
        for ref in refs[:10]:  # Show first 10
            word_position = (
                f"; word {ref['word_index']}" if "word_index" in ref else ""
            )
            lines.append(
                f"  {ref['verse']}: {ref['word']} ({ref['type']}{word_position})"
            )

        if len(refs) > 10:
            lines.append(f"  ... and {len(refs) - 10} more")
        lines.append("")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Load Levinsohn discourse features for NT books'
    )
    parser.add_argument(
        'book',
        nargs='?',
        help='NT book name (e.g., "Mark", "John", "Matt")'
    )
    parser.add_argument(
        '--features', '-f',
        help='Comma-separated list of features to extract (default: segmentation features)',
        default=None
    )
    parser.add_argument(
        '--output', '-o',
        choices=['text', 'json'],
        default='text',
        help='Output format (default: text)'
    )
    parser.add_argument(
        '--list-features', '-l',
        action='store_true',
        help='List all available features and exit'
    )

    args = parser.parse_args()

    # List features if requested
    if args.list_features:
        print("Available Features:")
        print("\nSegmentation Features (default):")
        for name in SEGMENTATION_FEATURES.keys():
            print(f"  - {name}")
        print("\nAll Features:")
        for name in sorted(ALL_FEATURES.keys()):
            marker = " *" if name in SEGMENTATION_FEATURES else ""
            print(f"  - {name}{marker}")
        print("\n* = segmentation feature (used by default)")
        return

    if not args.book:
        parser.error("book name is required (or use --list-features)")

    # Parse features argument
    features = None
    if args.features:
        features = [f.strip() for f in args.features.split(',')]
        # Validate features
        invalid = [f for f in features if f not in ALL_FEATURES]
        if invalid:
            print(f"Invalid features: {', '.join(invalid)}", file=sys.stderr)
            print("Use --list-features to see available features", file=sys.stderr)
            sys.exit(1)

    # Get discourse features
    data = get_discourse_features(args.book, features)

    # Format and print
    print(format_output(data, args.output))

    # Exit with error code if no features found
    if "error" in data or not data.get('features'):
        sys.exit(1)


if __name__ == '__main__':
    main()
