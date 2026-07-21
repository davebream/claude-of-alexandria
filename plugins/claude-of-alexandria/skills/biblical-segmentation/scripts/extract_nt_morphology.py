#!/usr/bin/env python3
"""
NT Morphology Extraction from MorphGNT

One-time script to extract morphological parsing data from MorphGNT SBLGNT.
Outputs per-book JSON files with verse-level morphological data.

Usage:
    python extract_nt_morphology.py --output-dir reference/morphology/nt
    python extract_nt_morphology.py --morphgnt-path /path/to/sblgnt --book Philippians

Requirements:
    - Clone MorphGNT: git clone https://github.com/morphgnt/sblgnt.git
    - Set MORPHGNT_PATH environment variable or use --morphgnt-path

MorphGNT parsing code format (8 characters):
    [person][tense][voice][mood][case][number][gender][degree]
    - person:  1/2/3/-
    - tense:   P=present, I=imperfect, F=future, A=aorist, X=perfect, Y=pluperfect
    - voice:   A=active, M=middle, P=passive
    - mood:    I=indicative, D=imperative, S=subjunctive, O=optative, N=infinitive, P=participle
    - case:    N=nominative, G=genitive, D=dative, A=accusative, V=vocative
    - number:  S=singular, P=plural
    - gender:  M=masculine, F=feminine, N=neuter
    - degree:  C=comparative, S=superlative
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional

import provenance

# NT book order and file mapping (MorphGNT format: ##-XXX-morphgnt.txt)
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

# Part of speech code mappings
POS_MAP = {
    'A-': 'adjective',
    'C-': 'conjunction',
    'D-': 'adverb',
    'I-': 'interjection',
    'N-': 'noun',
    'P-': 'preposition',
    'RA': 'article',
    'RD': 'demonstrative_pronoun',
    'RI': 'interrogative_indefinite_pronoun',
    'RP': 'personal_pronoun',
    'RR': 'relative_pronoun',
    'V-': 'verb',
    'X-': 'particle',
}

# Parsing code decoders (position-based, 8-char code)
# Format: [person][tense][voice][mood][case][number][gender][degree]
PERSON_MAP = {'1': '1', '2': '2', '3': '3', '-': None}
TENSE_MAP = {
    'P': 'present', 'I': 'imperfect', 'F': 'future',
    'A': 'aorist', 'X': 'perfect', 'Y': 'pluperfect', '-': None
}
VOICE_MAP = {'A': 'active', 'M': 'middle', 'P': 'passive', '-': None}
MOOD_MAP = {
    'I': 'indicative', 'D': 'imperative', 'S': 'subjunctive',
    'O': 'optative', 'N': 'infinitive', 'P': 'participle', '-': None
}
CASE_MAP = {
    'N': 'nominative', 'G': 'genitive', 'D': 'dative',
    'A': 'accusative', 'V': 'vocative', '-': None
}
NUMBER_MAP = {'S': 'singular', 'P': 'plural', '-': None}
GENDER_MAP = {'M': 'masculine', 'F': 'feminine', 'N': 'neuter', '-': None}
DEGREE_MAP = {'C': 'comparative', 'S': 'superlative', '-': None}


def decode_parsing(pos_code: str, parsing_code: str) -> Dict:
    """
    Decode 8-character parsing code into structured dict.

    Args:
        pos_code: Part of speech code (e.g., 'V-', 'N-')
        parsing_code: 8-character parsing code (e.g., '-AMPNSM-')

    Returns:
        Dict with decoded morphological categories (None values omitted)
    """
    if len(parsing_code) != 8:
        return {}

    result = {}

    person = PERSON_MAP.get(parsing_code[0])
    tense = TENSE_MAP.get(parsing_code[1])
    voice = VOICE_MAP.get(parsing_code[2])
    mood = MOOD_MAP.get(parsing_code[3])
    case = CASE_MAP.get(parsing_code[4])
    number = NUMBER_MAP.get(parsing_code[5])
    gender = GENDER_MAP.get(parsing_code[6])
    degree = DEGREE_MAP.get(parsing_code[7])

    if person is not None:
        result['person'] = person
    if tense is not None:
        result['tense'] = tense
    if voice is not None:
        result['voice'] = voice
    if mood is not None:
        result['mood'] = mood
    if case is not None:
        result['case'] = case
    if number is not None:
        result['number'] = number
    if gender is not None:
        result['gender'] = gender
    if degree is not None:
        result['degree'] = degree

    return result


def parse_morphgnt_line(line: str) -> Optional[Dict]:
    """
    Parse a single MorphGNT line.

    MorphGNT format (7 space-separated fields):
    BBCCVV POS PARSING CCAT-TEXT CCAT-WORD NORM-WORD LEMMA

    Returns:
        Dict with verse, text, normalized, lemma, pos, parsing or None
    """
    parts = line.strip().split()
    if len(parts) < 7:
        return None

    reference = parts[0]
    pos_code = parts[1]
    parsing_code = parts[2]
    text = parts[3]  # CCAT text (with punctuation)
    normalized = parts[5]  # Normalized form
    lemma = parts[6]  # Lemma

    # Strip punctuation marks (⸂⸃.,·;) from text
    text_clean = text.strip('⸂⸃.,·;!?:')

    # Parse reference: BBCCVV format
    if len(reference) < 6:
        return None

    try:
        chapter = int(reference[2:4])
        verse = int(reference[4:6])
    except ValueError:
        return None

    pos = POS_MAP.get(pos_code, pos_code.strip('-').lower() or 'unknown')
    parsing = decode_parsing(pos_code, parsing_code)

    return {
        'verse': f"{chapter}:{verse}",
        'text': text_clean,
        'normalized': normalized,
        'lemma': lemma,
        'pos': pos,
        'parsing': parsing,
    }


def extract_book_morphology(morphgnt_path: Path, book_code: str) -> Dict:
    """
    Extract morphological data for a single book.

    Returns:
        Dict mapping verse_ref -> list of word dicts
    """
    book_file = morphgnt_path / f"{book_code}.txt"

    if not book_file.exists():
        print(f"Warning: {book_file} not found", file=sys.stderr)
        return {}

    verses = defaultdict(list)
    summary_pos = defaultdict(int)

    with open(book_file, 'r', encoding='utf-8') as f:
        for line in f:
            parsed = parse_morphgnt_line(line)
            if parsed:
                verse_ref = parsed['verse']
                word_entry = {
                    'text': parsed['text'],
                    'normalized': parsed['normalized'],
                    'lemma': parsed['lemma'],
                    'pos': parsed['pos'],
                }
                if parsed['parsing']:
                    word_entry['parsing'] = parsed['parsing']

                verses[verse_ref].append(word_entry)
                summary_pos[parsed['pos']] += 1

    return {
        'verses': dict(verses),
        'summary_pos': dict(summary_pos),
    }


def write_book_json(book_name: str, data: Dict, output_dir: Path, metadata: Dict) -> None:
    """Write per-book JSON file."""
    filename = book_name.lower().replace(' ', '_') + '.json'
    filepath = output_dir / filename

    verses = data.get('verses', {})
    summary_pos = data.get('summary_pos', {})
    total_words = sum(len(words) for words in verses.values())

    output = {
        'metadata': metadata,
        'book': book_name,
        'summary': {
            'total_words': total_words,
            'total_verses': len(verses),
            'by_pos': summary_pos,
        },
        'verses': verses,
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"  Written: {filepath} ({total_words} words, {len(verses)} verses)")


def verify_philippians(output_dir: Path) -> None:
    """Verify Phil 1:6 ἐναρξάμενος = aorist middle participle."""
    print("\nVerification:")
    php_file = output_dir / 'philippians.json'

    if not php_file.exists():
        print("  Philippians file not found [FAIL]")
        return

    with open(php_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    verses = data.get('verses', {})
    verse_1_6 = verses.get('1:6', [])

    target = None
    for word in verse_1_6:
        if 'ἐναρξάμ' in word.get('text', '') or word.get('lemma') == 'ἐνάρχομαι':
            target = word
            break

    if not target:
        print("  Phil 1:6 ἐναρξάμενος: NOT FOUND [FAIL]")
        return

    parsing = target.get('parsing', {})
    tense = parsing.get('tense')
    voice = parsing.get('voice')
    mood = parsing.get('mood')

    expected = {'tense': 'aorist', 'voice': 'middle', 'mood': 'participle'}
    actual = {'tense': tense, 'voice': voice, 'mood': mood}
    status = "PASS" if actual == expected else "FAIL"

    print(f"  Phil 1:6 ἐναρξάμενος: tense={tense}, voice={voice}, mood={mood} [{status}]")
    if status == "FAIL":
        print(f"    Expected: {expected}")
        print(f"    Got: {actual}")
        print(f"    Full word entry: {target}")

    # Also verify ἐπιτελέσει = future active indicative
    for word in verse_1_6:
        if word.get('lemma') == 'ἐπιτελέω':
            p = word.get('parsing', {})
            t, v, m = p.get('tense'), p.get('voice'), p.get('mood')
            exp = {'tense': 'future', 'voice': 'active', 'mood': 'indicative'}
            act = {'tense': t, 'voice': v, 'mood': m}
            s = "PASS" if act == exp else "FAIL"
            print(f"  Phil 1:6 ἐπιτελέσει: tense={t}, voice={v}, mood={m} [{s}]")
            break


def main():
    parser = argparse.ArgumentParser(
        description='Extract NT morphology from MorphGNT to per-book JSON files'
    )
    parser.add_argument(
        '--morphgnt-path', '-m',
        default=os.environ.get('MORPHGNT_PATH', './sblgnt'),
        help='Path to MorphGNT repository (default: ./sblgnt or MORPHGNT_PATH env var)'
    )
    parser.add_argument(
        '--output-dir', '-o',
        default='reference/morphology/nt',
        help='Output directory for JSON files (default: reference/morphology/nt)'
    )
    parser.add_argument(
        '--book', '-b',
        help='Extract single book only (e.g., "Philippians")'
    )

    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    books_to_process = NT_BOOKS
    if args.book:
        if args.book not in NT_BOOKS:
            print(f"Error: Unknown book '{args.book}'", file=sys.stderr)
            print(f"Available: {', '.join(NT_BOOKS.keys())}", file=sys.stderr)
            sys.exit(1)
        books_to_process = {args.book: NT_BOOKS[args.book]}

    # A caller-supplied clone is used as-is (offline/dev); otherwise fetch the
    # pinned MorphGNT commit and verify every file against sblgnt-checksums.json.
    morphgnt_path = Path(args.morphgnt_path)
    if not morphgnt_path.exists():
        print(
            f"No local MorphGNT clone at {morphgnt_path}; fetching pinned commit "
            f"{provenance.SBLGNT_COMMIT_SHA[:12]} and verifying checksums...",
            file=sys.stderr,
        )
        morphgnt_path = provenance.ensure_source_root(
            "sblgnt", list(books_to_process.values())
        )

    metadata = {
        'source': 'MorphGNT/SBLGNT',
        'repository': 'https://github.com/morphgnt/sblgnt',
        'license': 'CC BY-SA 3.0',
        'commit': provenance.SBLGNT_COMMIT_SHA,
        'extraction_date': date.today().isoformat(),
        'parsing_format': '[person][tense][voice][mood][case][number][gender][degree]',
        # SBLGNT is a critical text: it omits three verses the Textus Receptus /
        # KJV tradition includes (Matt 17:21, 18:11, 23:14), so Matthew totals
        # 1,068 verses here, not the commonly cited 1,071. This is the source
        # edition's versification, not a missing-data gap. See
        # reference/morphology/DATA_SOURCES.md.
        'note': 'Verse-level morphological data for all words in book',
    }

    for book_name, book_code in books_to_process.items():
        print(f"Processing {book_name}...")
        data = extract_book_morphology(morphgnt_path, book_code)

        if not data.get('verses'):
            print(f"  Warning: No data extracted")
            continue

        write_book_json(book_name, data, output_dir, metadata)

    print(f"\nAll files written to {output_dir}/")
    verify_philippians(output_dir)


if __name__ == '__main__':
    main()
