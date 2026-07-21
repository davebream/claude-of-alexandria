#!/usr/bin/env python3
"""
OT Morphology Extraction from OpenScriptures morphhb

One-time script to extract morphological parsing data from morphhb XML files.
Outputs per-book JSON files with verse-level morphological data.

Usage:
    python extract_ot_morphology.py --output-dir reference/morphology/ot
    python extract_ot_morphology.py --morphhb-path /path/to/morphhb --book Genesis

Requirements:
    - Clone morphhb: git clone https://github.com/openscriptures/morphhb.git
    - Set MORPHHB_PATH environment variable or use --morphhb-path

morphhb morph code format:
    [language][POS][stem?][conjugation/type][person/subtype][gender][number][state]
    Language: H=Hebrew, A=Aramaic
    POS: V=Verb, N=Noun, A=Adjective, R=Preposition, C=Conjunction,
         D=Adverb, P=Pronoun, T=Article/Particle, S=Suffix, X=unclassified
    Verb stems: q=Qal, N=Niphal, p=Piel, P=Pual, h=Hiphil, H=Hophal,
                t=Hithpael, o=Polel, O=Polal, r=Hithpolel, m=Poel, D=Poel(D)
    Verb conjugations: p=perfect, i=imperfect, w=wayyiqtol, v=imperative,
                       r=active_participle, s=passive_participle,
                       a=inf_absolute, c=inf_construct, h=cohortative, j=jussive
    Noun types: c=common, p=proper, g=gentilic
    Gender: m=masculine, f=feminine, b=both/common
    Number: s=singular, p=plural, d=dual
    State: a=absolute, c=construct, d=determined
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import provenance

# OT book order and OSIS file mapping
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

OSIS_NS = {'osis': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}

# Part of speech mappings
POS_MAP = {
    'V': 'verb',
    'N': 'noun',
    'A': 'adjective',
    'P': 'pronoun',
    'R': 'preposition',
    'C': 'conjunction',
    'D': 'adverb',
    'T': 'particle',
    'S': 'suffix',
    'X': 'unknown',
}

# Verb stem mappings (binyanim) — language-specific
HEBREW_STEM_MAP = {
    'q': 'Qal', 'N': 'Niphal', 'p': 'Piel', 'P': 'Pual',
    'h': 'Hiphil', 'H': 'Hophal', 't': 'Hithpael',
    'o': 'Polel', 'O': 'Polal', 'r': 'Hithpolel',
    'm': 'Poel', 'M': 'Poal', 'k': 'Palel', 'K': 'Pulal',
    'Q': 'Qal_passive', 'l': 'Pilpel', 'L': 'Polpal',
    'f': 'Hithpalpel', 'D': 'Nithpael', 'j': 'Pealal',
    'i': 'Pilel', 'u': 'Hothpaal', 'c': 'Tiphil',
    'v': 'Hishtaphel', 'w': 'Nithpalel', 'y': 'Nithpoel',
    'z': 'Hithpoel',
}

ARAMAIC_STEM_MAP = {
    'q': 'Peal', 'Q': 'Peil', 'u': 'Hithpeel',
    'p': 'Pael', 'P': 'Ithpaal', 'M': 'Hithpaal',
    'a': 'Aphel', 'h': 'Haphel', 's': 'Saphel',
    'e': 'Shaphel', 'H': 'Hophal', 'i': 'Ithpeel',
    't': 'Hishtaphel', 'v': 'Ishtaphel', 'w': 'Hithaphel',
    'o': 'Polel', 'z': 'Ithpoel', 'r': 'Hithpolel',
    'f': 'Hithpalpel', 'b': 'Hephal', 'c': 'Tiphel',
    'm': 'Poel', 'l': 'Palpel', 'L': 'Ithpalpel',
    'O': 'Ithpolel', 'G': 'Ittaphal',
}

# Verb conjugation mappings
CONJUGATION_MAP = {
    'p': 'perfect', 'q': 'sequential_perfect', 'i': 'imperfect',
    'w': 'wayyiqtol', 'v': 'imperative',
    'r': 'active_participle', 's': 'passive_participle',
    'a': 'infinitive_absolute', 'c': 'infinitive_construct',
    'h': 'cohortative', 'j': 'jussive',
}

# Noun type mappings
NOUN_TYPE_MAP = {
    'c': 'common', 'p': 'proper', 'g': 'gentilic',
}

# Gender mappings
GENDER_MAP = {'m': 'masculine', 'f': 'feminine', 'b': 'both'}

# Number mappings
NUMBER_MAP = {'s': 'singular', 'p': 'plural', 'd': 'dual'}

# State mappings (for nouns/adjectives)
STATE_MAP = {'a': 'absolute', 'c': 'construct', 'd': 'determined'}


def decode_ot_morph(morph_code: str) -> Dict:
    """
    Decode morphhb morph attribute into structured dict.

    Handles compound forms (e.g., 'HR/Ncfsa' = preposition + noun).
    Returns parsing for the primary/last morpheme.

    Args:
        morph_code: The morph attribute value (e.g., 'HVqp3ms', 'HNcmsa')

    Returns:
        Dict with decoded morphological categories
    """
    if not morph_code:
        return {}

    # Split by / to handle prefix compounds
    # E.g., 'HR/Ncfsa' = preposition prefix / noun
    # E.g., 'HC/Td/Ncbsa' = conjunction / article / noun
    parts = morph_code.split('/')

    # Use the last meaningful part (the main word, not prefixes)
    # But also note the prefixes present
    result = {'prefixes': []}

    # Decode each part
    for i, part in enumerate(parts):
        is_last = (i == len(parts) - 1)

        # Strip language marker (H or A)
        lang = None
        code = part
        if code and code[0] in ('H', 'A'):
            lang = 'Hebrew' if code[0] == 'H' else 'Aramaic'
            code = code[1:]

        if not code:
            continue

        if is_last or len(parts) == 1:
            # This is the main word - decode fully
            lang_prefix = part[0] if part and part[0] in ('H', 'A') else 'H'
            result['language'] = lang or 'Hebrew'
            decoded = _decode_morpheme(code, lang_prefix)
            result.update(decoded)
        else:
            # This is a prefix - just note POS
            if code:
                prefix_pos = POS_MAP.get(code[0], code[0])
                result['prefixes'].append(prefix_pos)

    if not result['prefixes']:
        del result['prefixes']

    return result


def _decode_morpheme(code: str, language: str = 'H') -> Dict:
    """
    Decode a single morpheme code (without language prefix).
    """
    if not code:
        return {}

    result = {}
    pos_char = code[0]
    rest = code[1:]

    pos = POS_MAP.get(pos_char, pos_char)
    result['pos'] = pos

    if pos_char == 'V':
        result.update(_decode_verb(rest, language))
    elif pos_char in ('N', 'A'):
        result.update(_decode_noun_adj(rest))
    elif pos_char == 'P':
        result.update(_decode_pronoun(rest))
    elif pos_char == 'S':
        result.update(_decode_suffix(rest))
    # R, C, D, T, X: minimal decoding

    return result


def _decode_verb(code: str, language: str = 'H') -> Dict:
    """
    Decode verb morphology: [stem][conjugation][person][gender][number]
    """
    result = {}
    if not code:
        return result

    # Stem is 1 char — use language-specific map
    stem_map = ARAMAIC_STEM_MAP if language == 'A' else HEBREW_STEM_MAP
    stem_char = code[0]
    stem = stem_map.get(stem_char)
    if stem:
        result['stem'] = stem
    rest = code[1:]

    if not rest:
        return result

    # Conjugation is 1 char
    conj_char = rest[0]
    conj = CONJUGATION_MAP.get(conj_char)
    if conj:
        result['conjugation'] = conj
    rest = rest[1:]

    if not rest:
        return result

    # Person: 1, 2, 3 (or x for non-personal pronouns in some forms)
    if rest[0].isdigit():
        result['person'] = rest[0]
        rest = rest[1:]

    if not rest:
        return result

    # Gender: m, f, b, c (common)
    if rest[0] in GENDER_MAP:
        result['gender'] = GENDER_MAP[rest[0]]
        rest = rest[1:]
    elif rest[0] == 'c':
        result['gender'] = 'common'
        rest = rest[1:]

    if not rest:
        return result

    # Number: s, p, d
    if rest[0] in NUMBER_MAP:
        result['number'] = NUMBER_MAP[rest[0]]
        rest = rest[1:]

    return result


def _decode_noun_adj(code: str) -> Dict:
    """
    Decode noun/adjective morphology: [type][gender][number][state]
    """
    result = {}
    if not code:
        return result

    # Type: c=common, p=proper, g=gentilic, a=?, o=ordinal, f=?
    # For adjectives: a=?, c=cardinal, o=ordinal
    type_char = code[0]
    noun_type = NOUN_TYPE_MAP.get(type_char)
    if noun_type:
        result['noun_type'] = noun_type
    elif type_char == 'o':
        result['noun_type'] = 'ordinal'
    elif type_char in ('a', 'x'):
        result['noun_type'] = type_char
    rest = code[1:]

    if not rest:
        return result

    # Gender: m, f, b, c
    if rest[0] in GENDER_MAP:
        result['gender'] = GENDER_MAP[rest[0]]
        rest = rest[1:]
    elif rest[0] == 'c':
        result['gender'] = 'common'
        rest = rest[1:]

    if not rest:
        return result

    # Number: s, p, d
    if rest[0] in NUMBER_MAP:
        result['number'] = NUMBER_MAP[rest[0]]
        rest = rest[1:]

    if not rest:
        return result

    # State: a, c, d
    if rest[0] in STATE_MAP:
        result['state'] = STATE_MAP[rest[0]]

    return result


def _decode_pronoun(code: str) -> Dict:
    """Decode pronoun morphology."""
    result = {}
    if not code:
        return result

    # Pronoun type: p=personal, d=demonstrative, i=interrogative,
    #               r=relative, n=indefinite, f=reflexive
    pron_types = {
        'p': 'personal', 'd': 'demonstrative', 'i': 'interrogative',
        'r': 'relative', 'n': 'indefinite', 'f': 'reflexive',
        's': 'suffixed', 'x': 'x'
    }
    if code[0] in pron_types:
        result['pronoun_type'] = pron_types[code[0]]
        rest = code[1:]
    else:
        rest = code

    if not rest:
        return result

    # Person
    if rest[0].isdigit():
        result['person'] = rest[0]
        rest = rest[1:]

    if not rest:
        return result

    # Gender
    if rest[0] in GENDER_MAP:
        result['gender'] = GENDER_MAP[rest[0]]
        rest = rest[1:]

    if not rest:
        return result

    # Number
    if rest[0] in NUMBER_MAP:
        result['number'] = NUMBER_MAP[rest[0]]

    return result


def _decode_suffix(code: str) -> Dict:
    """Decode suffix morphology (pronominal suffixes)."""
    result = {}
    if not code:
        return result

    # Suffix type: p=pronominal, n=paragogic, d=directional
    suffix_types = {'p': 'pronominal', 'n': 'paragogic', 'd': 'directional'}
    if code[0] in suffix_types:
        result['suffix_type'] = suffix_types[code[0]]
        rest = code[1:]
    else:
        rest = code

    if not rest:
        return result

    # Person
    if rest[0].isdigit():
        result['person'] = rest[0]
        rest = rest[1:]

    if not rest:
        return result

    # Gender
    if rest[0] in GENDER_MAP:
        result['gender'] = GENDER_MAP[rest[0]]
        rest = rest[1:]

    if not rest:
        return result

    # Number
    if rest[0] in NUMBER_MAP:
        result['number'] = NUMBER_MAP[rest[0]]

    return result


def parse_strongs_from_lemma(lemma_attr: str) -> List[str]:
    """Extract Strong's numbers from lemma attribute."""
    if not lemma_attr:
        return []

    result = []
    for part in lemma_attr.split('/'):
        match = re.match(r'(\d+)\s*([a-z])?', part.strip())
        if match:
            num = match.group(1)
            suffix = match.group(2) or ''
            result.append(f"H{num}{suffix}")

    return result


def extract_book_morphology(morphhb_path: Path, book_code: str) -> Dict:
    """
    Extract morphological data for a single OT book.

    Returns:
        Dict with 'verses' mapping verse_ref -> list of word dicts
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

    verses = defaultdict(list)
    summary_pos = defaultdict(int)

    for verse in root.findall('.//osis:verse', OSIS_NS):
        osis_id = verse.get('osisID', '')
        if not osis_id:
            continue

        parts = osis_id.split('.')
        if len(parts) < 3:
            continue

        try:
            chapter = int(parts[1])
            verse_num = int(parts[2])
            verse_ref = f"{chapter}:{verse_num}"
        except ValueError:
            continue

        for w in verse.findall('.//osis:w', OSIS_NS):
            morph_attr = w.get('morph', '')
            lemma_attr = w.get('lemma', '')
            word_id = w.get('id', '')
            hebrew_text = w.text or ''

            if not morph_attr:
                continue

            strongs = parse_strongs_from_lemma(lemma_attr)
            parsing = decode_ot_morph(morph_attr)
            pos = parsing.get('pos', 'unknown')

            word_entry = {
                'text': hebrew_text,
                'strongs': strongs,
                'morph_code': morph_attr,
                'pos': pos,
            }

            # Add key parsing fields
            for field in ('stem', 'conjugation', 'person', 'gender', 'number',
                          'state', 'noun_type', 'prefixes'):
                if field in parsing:
                    if 'parsing' not in word_entry:
                        word_entry['parsing'] = {}
                    word_entry['parsing'][field] = parsing[field]

            verses[verse_ref].append(word_entry)
            summary_pos[pos] += 1

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


def verify_genesis(output_dir: Path) -> None:
    """Verify Gen 1:1 בְּרֵאשִׁית parsing."""
    print("\nVerification:")
    gen_file = output_dir / 'genesis.json'

    if not gen_file.exists():
        print("  Genesis file not found [FAIL]")
        return

    with open(gen_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    verses = data.get('verses', {})
    verse_1_1 = verses.get('1:1', [])

    if verse_1_1:
        first_word = verse_1_1[0]
        print(f"  Gen 1:1 first word: {first_word}")

        # Check for verb בָּרָא (bara = created) = H1254, Qal perfect 3ms
        bara = next((w for w in verse_1_1 if 'H1254' in w.get('strongs', [])), None)
        if bara:
            p = bara.get('parsing', {})
            stem = p.get('stem', '?')
            conj = p.get('conjugation', '?')
            print(f"  Gen 1:1 בָּרָא (bara): stem={stem}, conjugation={conj} [{'PASS' if stem == 'Qal' and conj == 'perfect' else 'CHECK'}]")
        else:
            print("  Gen 1:1 בָּרָא (H1254): not found in verse")

        total_words_1_1 = len(verse_1_1)
        status = "PASS" if total_words_1_1 == 7 else "CHECK"
        print(f"  Gen 1:1 word count: {total_words_1_1} (expected 7) [{status}]")
    else:
        print("  Gen 1:1: NOT FOUND [FAIL]")


def main():
    parser = argparse.ArgumentParser(
        description='Extract OT morphology from morphhb to per-book JSON files'
    )
    parser.add_argument(
        '--morphhb-path', '-m',
        default=os.environ.get('MORPHHB_PATH', './morphhb'),
        help='Path to morphhb repository (default: ./morphhb or MORPHHB_PATH env var)'
    )
    parser.add_argument(
        '--output-dir', '-o',
        default='reference/morphology/ot',
        help='Output directory for JSON files (default: reference/morphology/ot)'
    )
    parser.add_argument(
        '--book', '-b',
        help='Extract single book only (e.g., "Genesis")'
    )

    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    books_to_process = OT_BOOKS
    if args.book:
        if args.book not in OT_BOOKS:
            print(f"Error: Unknown book '{args.book}'", file=sys.stderr)
            print(f"Available: {', '.join(OT_BOOKS.keys())}", file=sys.stderr)
            sys.exit(1)
        books_to_process = {args.book: OT_BOOKS[args.book]}

    # A caller-supplied clone is used as-is (offline/dev); otherwise fetch the
    # pinned morphhb commit and verify every WLC file against oshb-checksums.json
    # (the same lockfile extract_oshb_paragraphs.py uses — one source of truth).
    morphhb_path = Path(args.morphhb_path)
    if not morphhb_path.exists():
        print(
            f"No local morphhb clone at {morphhb_path}; fetching pinned commit "
            f"{provenance.MORPHHB_COMMIT_SHA[:12]} and verifying checksums...",
            file=sys.stderr,
        )
        morphhb_path = provenance.ensure_source_root(
            "morphhb", list(books_to_process.values())
        )

    metadata = {
        'source': 'OpenScriptures morphhb / OSHB',
        'repository': 'https://github.com/openscriptures/morphhb',
        'license': 'CC BY 4.0',
        'commit': provenance.MORPHHB_COMMIT_SHA,
        'extraction_date': date.today().isoformat(),
        'note': 'Verse-level morphological data. Morph codes follow OSHB tagging system.'
    }

    for book_name, book_code in books_to_process.items():
        print(f"Processing {book_name}...")
        data = extract_book_morphology(morphhb_path, book_code)

        if not data.get('verses'):
            print(f"  Warning: No data extracted")
            continue

        write_book_json(book_name, data, output_dir, metadata)

    print(f"\nAll files written to {output_dir}/")
    verify_genesis(output_dir)


if __name__ == '__main__':
    main()
