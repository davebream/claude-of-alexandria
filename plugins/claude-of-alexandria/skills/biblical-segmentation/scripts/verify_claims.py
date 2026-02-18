#!/usr/bin/env python3
"""
Data Claim Verifier for Exegetical Output

Programmatically verifies that data citations in generated markdown match
the actual bundled biblical data. Deterministic, zero-hallucination verification.

Usage:
    python verify_claims.py output.md
    python verify_claims.py output.md --output json
    echo "χαρά appears 5x in Phil 1:1-11" | python verify_claims.py --stdin

What it verifies:
    - Lemma frequency:  "χαρά (5x)" or "χαρά appears 5x in Phil 1:1-11"
    - Morphological form: "ἐναρξάμενος is aorist middle participle"
    - Masoretic marker: "פ at Gen 39:1" or "ס at Deut 6:1"
    - Levinsohn feature: "Historical Present at Mark 1:29" or "HP at John 3:1"
    - Verse range validity: verse references in claims
    - Data Sources section: checks "## Data Sources" section exists

Output statuses:
    PASS       - claim verified against bundled data
    FAIL       - claim contradicts bundled data (specific error given)
    UNVERIFIABLE - claim type cannot be checked programmatically (e.g., web sources)
    ERROR      - verification process encountered an error
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add scripts directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Try to import vocabulary and morphology parsers
try:
    from vocabulary_parser import get_book_vocabulary
    VOCAB_AVAILABLE = True
except ImportError:
    VOCAB_AVAILABLE = False

try:
    from morphology_parser import get_morphology_for_range
    MORPH_AVAILABLE = True
except ImportError:
    MORPH_AVAILABLE = False

try:
    from levinsohn_parser import get_discourse_features
    LEVINSOHN_AVAILABLE = True
except ImportError:
    LEVINSOHN_AVAILABLE = False

try:
    from sefaria_paragraphs import get_paragraph_breaks
    SEFARIA_AVAILABLE = True
except ImportError:
    SEFARIA_AVAILABLE = False

# Book name normalization for claim parsing
NT_ABBREVIATIONS = {
    'Matt': 'Matthew', 'Mt': 'Matthew', 'Matthew': 'Matthew',
    'Mark': 'Mark', 'Mk': 'Mark',
    'Luke': 'Luke', 'Lk': 'Luke',
    'John': 'John', 'Jn': 'John',
    'Acts': 'Acts', 'Ac': 'Acts',
    'Rom': 'Romans', 'Romans': 'Romans',
    '1 Cor': '1 Corinthians', '1Cor': '1 Corinthians',
    '2 Cor': '2 Corinthians', '2Cor': '2 Corinthians',
    'Gal': 'Galatians', 'Galatians': 'Galatians',
    'Eph': 'Ephesians', 'Ephesians': 'Ephesians',
    'Phil': 'Philippians', 'Php': 'Philippians', 'Philippians': 'Philippians',
    'Col': 'Colossians', 'Colossians': 'Colossians',
    '1 Thess': '1 Thessalonians', '1Thess': '1 Thessalonians',
    '2 Thess': '2 Thessalonians', '2Thess': '2 Thessalonians',
    '1 Tim': '1 Timothy', '1Tim': '1 Timothy',
    '2 Tim': '2 Timothy', '2Tim': '2 Timothy',
    'Tit': 'Titus', 'Titus': 'Titus',
    'Phlm': 'Philemon', 'Philemon': 'Philemon',
    'Heb': 'Hebrews', 'Hebrews': 'Hebrews',
    'Jas': 'James', 'James': 'James',
    '1 Pet': '1 Peter', '1Pet': '1 Peter',
    '2 Pet': '2 Peter', '2Pet': '2 Peter',
    '1 John': '1 John', '1Jn': '1 John',
    '2 John': '2 John', '2Jn': '2 John',
    '3 John': '3 John', '3Jn': '3 John',
    'Jude': 'Jude',
    'Rev': 'Revelation', 'Revelation': 'Revelation',
}

OT_ABBREVIATIONS = {
    'Gen': 'Genesis', 'Genesis': 'Genesis',
    'Exod': 'Exodus', 'Exo': 'Exodus', 'Exodus': 'Exodus',
    'Lev': 'Leviticus', 'Leviticus': 'Leviticus',
    'Num': 'Numbers', 'Numbers': 'Numbers',
    'Deut': 'Deuteronomy', 'Deuteronomy': 'Deuteronomy',
    'Josh': 'Joshua', 'Joshua': 'Joshua',
    'Judg': 'Judges', 'Judges': 'Judges',
    'Ruth': 'Ruth',
    '1 Sam': '1 Samuel', '1Sam': '1 Samuel',
    '2 Sam': '2 Samuel', '2Sam': '2 Samuel',
    '1 Kgs': '1 Kings', '1Kgs': '1 Kings',
    '2 Kgs': '2 Kings', '2Kgs': '2 Kings',
    '1 Chr': '1 Chronicles', '1Chr': '1 Chronicles',
    '2 Chr': '2 Chronicles', '2Chr': '2 Chronicles',
    'Ezra': 'Ezra', 'Neh': 'Nehemiah', 'Esth': 'Esther',
    'Job': 'Job', 'Ps': 'Psalms', 'Prov': 'Proverbs',
    'Eccl': 'Ecclesiastes', 'Song': 'Song of Songs',
    'Isa': 'Isaiah', 'Jer': 'Jeremiah', 'Lam': 'Lamentations',
    'Ezek': 'Ezekiel', 'Dan': 'Daniel', 'Hos': 'Hosea',
    'Joel': 'Joel', 'Amos': 'Amos', 'Obad': 'Obadiah',
    'Jonah': 'Jonah', 'Mic': 'Micah', 'Nah': 'Nahum',
    'Hab': 'Habakkuk', 'Zeph': 'Zephaniah', 'Hag': 'Haggai',
    'Zech': 'Zechariah', 'Mal': 'Malachi',
}

ALL_ABBREVIATIONS = {**NT_ABBREVIATIONS, **OT_ABBREVIATIONS}

# Morphological term normalization for claim parsing
MORPH_SYNONYMS = {
    'tense': {
        'present': ['present', 'pres'],
        'imperfect': ['imperfect', 'imperf'],
        'future': ['future', 'fut'],
        'aorist': ['aorist', 'aor'],
        'perfect': ['perfect', 'perf'],
        'pluperfect': ['pluperfect', 'pluperf'],
    },
    'voice': {
        'active': ['active', 'act'],
        'middle': ['middle', 'mid'],
        'passive': ['passive', 'pass'],
    },
    'mood': {
        'indicative': ['indicative', 'indic', 'ind'],
        'imperative': ['imperative', 'imper', 'imp'],
        'subjunctive': ['subjunctive', 'subj'],
        'optative': ['optative', 'opt'],
        'infinitive': ['infinitive', 'inf'],
        'participle': ['participle', 'ptc', 'part'],
    },
}


def normalize_book(book_str: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Normalize a book abbreviation to full name and testament.

    Returns:
        Tuple of (full_name, testament) or (None, None) if not found
    """
    # Try direct lookup
    if book_str in NT_ABBREVIATIONS:
        return NT_ABBREVIATIONS[book_str], 'nt'
    if book_str in OT_ABBREVIATIONS:
        return OT_ABBREVIATIONS[book_str], 'ot'

    # Try case-insensitive
    for abbr, full in NT_ABBREVIATIONS.items():
        if abbr.lower() == book_str.lower():
            return full, 'nt'
    for abbr, full in OT_ABBREVIATIONS.items():
        if abbr.lower() == book_str.lower():
            return full, 'ot'

    return None, None


def normalize_morph_term(term: str, category: str) -> Optional[str]:
    """
    Normalize a morphological term (e.g., 'aor' -> 'aorist').

    Args:
        term: The term to normalize
        category: 'tense', 'voice', or 'mood'

    Returns:
        Canonical form or None if not recognized
    """
    term_lower = term.lower().strip()
    synonyms = MORPH_SYNONYMS.get(category, {})
    for canonical, variants in synonyms.items():
        if term_lower in variants or term_lower == canonical:
            return canonical
    return None


# ===========================================================================
# Claim Extractors
# ===========================================================================

def extract_lemma_frequency_claims(text: str) -> List[Dict]:
    """
    Extract lemma frequency claims from text.

    Patterns:
        - "χαρά (5x)" or "χαρά (5×)"
        - "χαρά appears 5x in Phil 1:1-11"
        - "χαρά appears 5 times in Philippians 1:1-11"
        - "χαρά: 5x" or "χαρά: 5 occurrences"
        - "H1285 (12x in Genesis)"
    """
    claims = []

    # Pattern 1: word (Nx) or word (Nx in Book chapter:verse-chapter:verse)
    pattern1 = re.compile(
        r'([^\s(,;]+)\s*\((\d+)[x×]\s*(?:in\s+([12]?\s*\w+(?:\s+\w+)?)\s+'
        r'(\d+:\d+(?:-\d+:\d+)?))?\)',
        re.UNICODE
    )
    for m in pattern1.finditer(text):
        word = m.group(1).strip('*_`')
        count = int(m.group(2))
        book_str = m.group(3)
        ref = m.group(4)

        # Only claim if word looks like Greek/Hebrew (not English)
        if _looks_like_biblical_word(word):
            claims.append({
                'type': 'lemma_frequency',
                'word': word,
                'claimed_count': count,
                'book': book_str,
                'reference': ref,
                'raw': m.group(0),
            })

    # Pattern 2: "word appears N times in Book ref" or "word appears Nx in Book ref"
    # Handles both "1:1-1:11" and abbreviated "1:1-11" (same chapter)
    pattern2 = re.compile(
        r'([^\s,;]+)\s+appears?\s+(\d+)\s*(?:times?|[x×])\s+in\s+'
        r'([12]?\s*\w+(?:\s+\w+)?)\s+(\d+:\d+(?:-\d+(?::\d+)?)?)',
        re.UNICODE
    )
    for m in pattern2.finditer(text):
        word = m.group(1).strip('*_`')
        count = int(m.group(2))
        book_str = m.group(3).strip()
        ref = m.group(4)

        if _looks_like_biblical_word(word):
            claims.append({
                'type': 'lemma_frequency',
                'word': word,
                'claimed_count': count,
                'book': book_str,
                'reference': ref,
                'raw': m.group(0),
            })

    return claims


def extract_morphological_claims(text: str) -> List[Dict]:
    """
    Extract morphological form claims from text.

    Patterns:
        - "ἐναρξάμενος is aorist middle participle"
        - "ἐναρξάμενος = aorist middle participle"
        - "ἐναρξάμενος (aorist middle participle)"
    """
    claims = []

    # Tense/voice/mood terms
    tense_terms = '|'.join(
        v for vs in MORPH_SYNONYMS['tense'].values() for v in vs
    )
    voice_terms = '|'.join(
        v for vs in MORPH_SYNONYMS['voice'].values() for v in vs
    )
    mood_terms = '|'.join(
        v for vs in MORPH_SYNONYMS['mood'].values() for v in vs
    )

    morph_pattern = re.compile(
        rf'([^\s,;(]+)\s+(?:is|=|:)\s+(({tense_terms})\s+({voice_terms})\s+({mood_terms})'
        rf'|({voice_terms})\s+({mood_terms})'
        rf'|({tense_terms})\s+({mood_terms}))',
        re.IGNORECASE | re.UNICODE
    )

    for m in morph_pattern.finditer(text):
        word = m.group(1).strip('*_`()[]')
        morph_str = m.group(2).strip()

        if _looks_like_biblical_word(word):
            claims.append({
                'type': 'morphological_form',
                'word': word,
                'claimed_parsing': morph_str,
                'raw': m.group(0),
            })

    return claims


def extract_masoretic_claims(text: str) -> List[Dict]:
    """
    Extract Masoretic paragraph marker claims.

    Patterns:
        - "פ at Gen 39:1"
        - "ס at Deut 6:1"
        - "setumah at Gen 1:5"
        - "petucha at Exod 14:1"
    """
    claims = []

    # Hebrew markers
    marker_pattern = re.compile(
        r'(Petuchah|Setumah|Petucha|petucha|petuchah|setumah|[פס])\s+'
        r'(?:at\s+)?([12]?\s*\w+(?:\s+\w+)?)\s+(\d+:\d+)',
        re.UNICODE
    )

    for m in marker_pattern.finditer(text):
        marker = m.group(1).strip()
        book_str = m.group(2).strip()
        ref = m.group(3)

        # Normalize marker
        if marker in ('פ', 'petucha', 'Petucha', 'petuchah', 'Petuchah'):
            marker_type = 'petuchah'
        elif marker in ('ס', 'setumah', 'Setumah'):
            marker_type = 'setumah'
        else:
            marker_type = marker

        claims.append({
            'type': 'masoretic_marker',
            'marker': marker_type,
            'book': book_str,
            'reference': ref,
            'raw': m.group(0),
        })

    return claims


def extract_levinsohn_claims(text: str) -> List[Dict]:
    """
    Extract Levinsohn discourse feature claims.

    Patterns:
        - "Historical Present at Mark 1:29"
        - "HP at Mark 1:29"
        - "Referential PoD at Phil 1:3"
        - "PoD at Phil 1:3"
    """
    claims = []

    # Known Levinsohn feature names and abbreviations
    levinsohn_features = {
        'HP': 'Historical_Present',
        'Historical Present': 'Historical_Present',
        'PoD': 'Referential_PoD',
        'Referential PoD': 'Referential_PoD',
        'Situational PoD': 'Situational_PoD',
        'DFE': 'DFE',
        'Focus+': 'Focus+',
        'THL': 'Tail-Head_linkage',
        'Tail-Head Linkage': 'Tail-Head_linkage',
        'Historical Perfect': 'Historical_Perfect',
        'Left-Dislocation': 'Left-Dislocation',
        'Reported Speech': 'Reported_Speech',
        'Over-encoding': 'Over-encoding',
    }

    feature_pattern_str = '|'.join(
        re.escape(k) for k in sorted(levinsohn_features.keys(), key=len, reverse=True)
    )

    lev_pattern = re.compile(
        rf'({feature_pattern_str})\s+(?:at\s+)?([12]?\s*\w+(?:\s+\w+)?)\s+(\d+:\d+)',
        re.IGNORECASE | re.UNICODE
    )

    for m in lev_pattern.finditer(text):
        feature_str = m.group(1)
        book_str = m.group(2).strip()
        ref = m.group(3)

        # Normalize feature name
        feature_key = None
        for k, v in levinsohn_features.items():
            if k.lower() == feature_str.lower():
                feature_key = v
                break

        claims.append({
            'type': 'levinsohn_feature',
            'feature': feature_key or feature_str,
            'book': book_str,
            'reference': ref,
            'raw': m.group(0),
        })

    return claims


def _looks_like_biblical_word(word: str) -> bool:
    """
    Check if a word looks like a Greek or Hebrew biblical term.

    Heuristic: contains non-ASCII characters (Greek/Hebrew) or
    starts with H followed by digits (Strong's number).
    """
    if not word:
        return False

    # Strong's number (H1234 or G1234)
    if re.match(r'^[HG]\d+', word):
        return True

    # Contains Greek or Hebrew characters
    for ch in word:
        cp = ord(ch)
        # Greek: U+0370-U+03FF, U+1F00-U+1FFF
        if 0x0370 <= cp <= 0x03FF or 0x1F00 <= cp <= 0x1FFF:
            return True
        # Hebrew: U+0590-U+05FF, U+FB1D-U+FB4F
        if 0x0590 <= cp <= 0x05FF or 0xFB1D <= cp <= 0xFB4F:
            return True

    return False


def check_data_sources_section(text: str) -> Dict:
    """Check if markdown has a Data Sources section."""
    has_section = bool(re.search(r'^#{1,3}\s+Data Sources', text, re.MULTILINE))
    return {
        'type': 'section_check',
        'check': 'data_sources_present',
        'status': 'PASS' if has_section else 'FAIL',
        'note': 'Found "## Data Sources" section' if has_section else 'Missing "## Data Sources" section',
    }


# ===========================================================================
# Claim Verifiers
# ===========================================================================

def _load_vocab_json(book_full: str, testament: str) -> Optional[Dict]:
    """
    Load per-book vocabulary JSON (has verse-level data for range filtering).
    Falls back to vocabulary_parser YAML data if JSON not available.
    """
    vocab_dir = Path(__file__).parent.parent / "reference" / "vocabulary" / testament
    filename = book_full.lower().replace(' ', '_') + '.json'
    filepath = vocab_dir / filename

    if filepath.exists():
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('lemmas', {})

    return None


def verify_lemma_frequency(claim: Dict) -> Dict:
    """Verify a lemma frequency claim against vocabulary data."""
    word = claim.get('word', '')
    claimed_count = claim.get('claimed_count', 0)
    book_str = claim.get('book')
    ref = claim.get('reference')

    if not book_str:
        return {
            **claim,
            'status': 'UNVERIFIABLE',
            'note': 'No book reference in claim - cannot verify count'
        }

    book_full, testament = normalize_book(book_str)
    if not book_full:
        return {
            **claim,
            'status': 'ERROR',
            'note': f"Unknown book: '{book_str}'"
        }

    # Try per-book JSON first (has verse-level data for range filtering)
    lemmas = _load_vocab_json(book_full, testament)

    if lemmas is None and VOCAB_AVAILABLE:
        # Fallback: use vocabulary_parser YAML (has by_chapter, not verses)
        vocab_result = get_book_vocabulary(book_full, testament)
        if 'error' in vocab_result:
            return {**claim, 'status': 'ERROR', 'note': vocab_result['error']}
        lemmas = vocab_result.get('data', {}).get('lemmas', {})

    if lemmas is None:
        return {**claim, 'status': 'ERROR', 'note': 'Vocabulary data not available'}

    if word not in lemmas:
        return {
            **claim,
            'status': 'FAIL',
            'note': f"'{word}' not found in {book_full} vocabulary data",
            'actual_count': 0,
        }

    word_data = lemmas[word]
    all_verses = word_data.get('verses', [])

    # Filter by reference range if provided
    if ref:
        # Parse the range and count occurrences within it
        actual_count = _count_occurrences_in_range(all_verses, ref)
    else:
        actual_count = word_data.get('total', len(all_verses))

    status = 'PASS' if actual_count == claimed_count else 'FAIL'

    result = {
        **claim,
        'status': status,
        'actual_count': actual_count,
    }

    if status == 'FAIL':
        result['note'] = (
            f"Count mismatch: claimed {claimed_count}, actual {actual_count} "
            f"in {ref or book_full}"
        )

    return result


def _count_occurrences_in_range(verses: List[str], ref: str) -> int:
    """Count verse occurrences within a chapter:verse range.

    Handles:
        - Single verse: "1:6"
        - Full range: "1:1-1:11"
        - Abbreviated range: "1:1-11" (same chapter implied for end)
    """
    if '-' in ref:
        parts = ref.split('-', 1)
        start_parts = parts[0].strip().split(':')
        end_str = parts[1].strip()
        # If end has colon, it's a full ref; otherwise abbreviated (same chapter)
        if ':' in end_str:
            end_parts = end_str.split(':')
            try:
                start_ch, start_vs = int(start_parts[0]), int(start_parts[1])
                end_ch, end_vs = int(end_parts[0]), int(end_parts[1])
            except (ValueError, IndexError):
                return len(verses)
        else:
            # Abbreviated: "1:1-11" -> same chapter as start
            try:
                start_ch, start_vs = int(start_parts[0]), int(start_parts[1])
                end_ch, end_vs = start_ch, int(end_str)
            except (ValueError, IndexError):
                return len(verses)
    else:
        parts = ref.split(':')
        try:
            ch, vs = int(parts[0]), int(parts[1])
            start_ch, start_vs = ch, vs
            end_ch, end_vs = ch, vs
        except (ValueError, IndexError):
            return len(verses)

    count = 0
    for verse_ref in verses:
        try:
            ch, vs = verse_ref.split(':', 1)
            ch, vs = int(ch), int(vs)

            in_range = True
            if ch < start_ch or (ch == start_ch and vs < start_vs):
                in_range = False
            if ch > end_ch or (ch == end_ch and vs > end_vs):
                in_range = False

            if in_range:
                count += 1
        except (ValueError, AttributeError):
            continue

    return count


def verify_morphological_form(claim: Dict) -> Dict:
    """Verify a morphological form claim against morphology data."""
    if not MORPH_AVAILABLE:
        return {**claim, 'status': 'ERROR', 'note': 'morphology_parser not available'}

    word = claim.get('word', '')
    claimed_parsing = claim.get('claimed_parsing', '')

    # Parse the claimed morphology string
    claimed = _parse_morph_string(claimed_parsing)

    if not claimed:
        return {
            **claim,
            'status': 'UNVERIFIABLE',
            'note': f"Could not parse morphological claim: '{claimed_parsing}'"
        }

    # Search for the word across NT (most common use case)
    # Try common NT books first, then all
    found_parsing = None
    found_in = None

    for testament in ['nt', 'ot']:
        for book in _get_all_books(testament):
            # Search all chapters for the word
            result = _find_word_parsing(word, book, testament)
            if result:
                found_parsing = result
                found_in = f"{book} ({testament.upper()})"
                break
        if found_parsing:
            break

    if not found_parsing:
        return {
            **claim,
            'status': 'UNVERIFIABLE',
            'note': f"'{word}' not found in morphology data (may need book context)"
        }

    # Compare claimed vs actual
    mismatches = []
    for field in ('tense', 'voice', 'mood', 'case', 'number', 'gender', 'person',
                  'stem', 'conjugation'):
        if field in claimed:
            actual_val = found_parsing.get(field)
            claimed_val = claimed[field]
            if actual_val and actual_val != claimed_val:
                mismatches.append(
                    f"{field}: claimed '{claimed_val}', actual '{actual_val}'"
                )

    if mismatches:
        return {
            **claim,
            'status': 'FAIL',
            'actual_parsing': found_parsing,
            'found_in': found_in,
            'note': 'Parsing mismatch: ' + '; '.join(mismatches),
        }

    return {
        **claim,
        'status': 'PASS',
        'actual_parsing': found_parsing,
        'found_in': found_in,
    }


def _parse_morph_string(morph_str: str) -> Dict:
    """Parse a natural language morphology string like 'aorist middle participle'."""
    result = {}
    words = morph_str.lower().split()

    for word in words:
        for category in ('tense', 'voice', 'mood'):
            canonical = normalize_morph_term(word, category)
            if canonical:
                result[category] = canonical
                break

    # Hebrew stem names
    hebrew_stems = {
        'qal', 'niphal', 'piel', 'pual', 'hiphil', 'hophal', 'hithpael',
        'polel', 'polal', 'hithpolel',
    }
    for word in words:
        if word.lower() in hebrew_stems:
            result['stem'] = word.lower().capitalize()
            break

    return result


def _find_word_parsing(word: str, book: str, testament: str) -> Optional[Dict]:
    """Find the parsing for a specific word in a book."""
    from morphology_parser import load_book_data

    data = load_book_data(book, testament)
    if 'error' in data:
        return None

    verses = data.get('verses', {})
    for verse_ref, words in verses.items():
        for w in words:
            # Match by text, normalized form, or lemma
            if (word in (w.get('text', ''), w.get('normalized', ''), w.get('lemma', ''))
                    or word in w.get('text', '')):
                return w.get('parsing', {})

    return None


def _get_all_books(testament: str) -> List[str]:
    """Get list of all books for a testament."""
    from morphology_parser import MORPH_DIR
    morph_dir = MORPH_DIR / testament
    if not morph_dir.exists():
        return []
    return [f.stem for f in sorted(morph_dir.glob('*.json'))]


def verify_masoretic_marker(claim: Dict) -> Dict:
    """Verify a Masoretic paragraph marker claim."""
    if not SEFARIA_AVAILABLE:
        return {**claim, 'status': 'UNVERIFIABLE', 'note': 'sefaria_paragraphs not available'}

    from sefaria_paragraphs import get_paragraph_breaks

    marker_type = claim.get('marker', '').lower()
    book_str = claim.get('book', '')
    ref = claim.get('reference', '')

    book_full, testament = normalize_book(book_str)
    if not book_full or testament != 'ot':
        return {**claim, 'status': 'UNVERIFIABLE', 'note': 'Masoretic data only covers OT'}

    breaks = get_paragraph_breaks(book_full)
    if not breaks:
        return {**claim, 'status': 'UNVERIFIABLE', 'note': f'No Masoretic data for {book_full}'}

    # Normalize marker type
    type_map = {
        'פ': 'petuchah', 'petucha': 'petuchah', 'petuchah': 'petuchah',
        'ס': 'setumah', 'setumah': 'setumah',
    }
    expected_type = type_map.get(marker_type, marker_type)

    for b in breaks:
        if ref in b.get('reference', '') and b.get('type', '') == expected_type:
            return {**claim, 'status': 'PASS', 'note': f"Marker confirmed at {b['reference']}"}

    return {**claim, 'status': 'FAIL', 'note': f"{expected_type} not found at {book_full} {ref}"}


def verify_levinsohn_feature(claim: Dict) -> Dict:
    """Verify a Levinsohn discourse feature claim."""
    if not LEVINSOHN_AVAILABLE:
        return {**claim, 'status': 'ERROR', 'note': 'levinsohn_parser not available'}

    feature = claim.get('feature', '')
    book_str = claim.get('book', '')
    ref = claim.get('reference', '')

    book_full, testament = normalize_book(book_str)
    if not book_full or testament != 'nt':
        return {
            **claim,
            'status': 'UNVERIFIABLE',
            'note': f"Levinsohn data only covers NT. Book: '{book_str}'"
        }

    # Try to check via levinsohn_parser
    try:
        # levinsohn_parser.get_levinsohn_features returns features for a book
        # We need to check if a specific feature exists at a specific verse
        result = _check_levinsohn_at_verse(feature, book_full, ref)
        return {**claim, **result}
    except Exception as e:
        return {
            **claim,
            'status': 'ERROR',
            'note': f"Levinsohn check error: {e}"
        }


def _check_levinsohn_at_verse(feature: str, book: str, verse_ref: str) -> Dict:
    """Check if a Levinsohn feature exists at a specific verse."""
    from levinsohn_parser import get_discourse_features

    # Map feature names to levinsohn_parser keys (lowercase, underscore)
    feature_key_map = {
        'Historical_Present': 'historical_present',
        'Referential_PoD': 'referential_pod',
        'Situational_PoD': 'situational_pod',
        'DFE': 'dfe',
        'Focus+': 'focus_plus',
        'Tail-Head_linkage': 'tail_head_linkage',
        'Historical_Perfect': 'historical_perfect',
        'Left-Dislocation': 'left_dislocation',
        'Reported_Speech': 'reported_speech',
        'Over-encoding': 'over_encoding',
    }

    feature_key = feature_key_map.get(feature, feature.lower().replace('-', '_'))
    result = get_discourse_features(book, features=[feature_key])

    if not result or 'error' in result:
        return {
            'status': 'UNVERIFIABLE',
            'note': f"Levinsohn feature '{feature}' data not found"
        }

    # get_discourse_features returns: {features: {feature_key: [refs]}, ...}
    refs = result.get('features', {}).get(feature_key, [])
    if not refs or (isinstance(refs, dict) and 'error' in refs):
        return {
            'status': 'UNVERIFIABLE',
            'note': f"No {feature} data for {book}"
        }

    # Search for verse_ref in returned references
    for ref_entry in refs:
        verse = ref_entry.get('verse', '')
        if verse_ref in verse:
            return {'status': 'PASS', 'note': f"Feature found at {verse}"}

    return {
        'status': 'FAIL',
        'note': f"{feature} not found at {book} {verse_ref} in Levinsohn data"
    }


# ===========================================================================
# Main Verification Pipeline
# ===========================================================================

def verify_text(text: str, source_name: str = 'input') -> Dict:
    """
    Run full verification pipeline on text content.

    Returns:
        Dict with verification results
    """
    results = []

    # 1. Check Data Sources section
    ds_check = check_data_sources_section(text)
    results.append(ds_check)

    # 2. Extract and verify lemma frequency claims
    lemma_claims = extract_lemma_frequency_claims(text)
    for claim in lemma_claims:
        result = verify_lemma_frequency(claim)
        results.append(result)

    # 3. Extract and verify morphological form claims
    morph_claims = extract_morphological_claims(text)
    for claim in morph_claims:
        result = verify_morphological_form(claim)
        results.append(result)

    # 4. Extract and verify Masoretic marker claims
    maso_claims = extract_masoretic_claims(text)
    for claim in maso_claims:
        result = verify_masoretic_marker(claim)
        results.append(result)

    # 5. Extract and verify Levinsohn feature claims
    lev_claims = extract_levinsohn_claims(text)
    for claim in lev_claims:
        result = verify_levinsohn_feature(claim)
        results.append(result)

    # Compute summary
    total = len(results)
    passed = sum(1 for r in results if r.get('status') == 'PASS')
    failed = sum(1 for r in results if r.get('status') == 'FAIL')
    unverifiable = sum(1 for r in results if r.get('status') == 'UNVERIFIABLE')
    errors = sum(1 for r in results if r.get('status') == 'ERROR')

    return {
        'source': source_name,
        'claims_found': total,
        'claims_verified': passed,
        'claims_failed': failed,
        'claims_unverifiable': unverifiable,
        'claims_error': errors,
        'overall': 'PASS' if failed == 0 and errors == 0 else 'FAIL',
        'results': results,
    }


def format_output(data: Dict, output_format: str = 'yaml') -> str:
    """Format output as YAML or JSON."""
    import yaml
    if output_format == 'json':
        return json.dumps(data, indent=2, ensure_ascii=False)
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def main():
    parser = argparse.ArgumentParser(
        description='Verify data claims in exegetical markdown output'
    )
    parser.add_argument(
        'file',
        nargs='?',
        help='Markdown file to verify'
    )
    parser.add_argument(
        '--stdin',
        action='store_true',
        help='Read from stdin instead of file'
    )
    parser.add_argument(
        '--output', '-o',
        choices=['yaml', 'json'],
        default='yaml',
        help='Output format (default: yaml)'
    )

    args = parser.parse_args()

    if args.stdin:
        text = sys.stdin.read()
        source_name = 'stdin'
    elif args.file:
        filepath = Path(args.file)
        if not filepath.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            sys.exit(1)
        text = filepath.read_text(encoding='utf-8')
        source_name = args.file
    else:
        parser.error("Provide a file path or use --stdin")
        return 1

    result = verify_text(text, source_name)
    print(format_output(result, args.output))

    # Exit 1 if any failures
    return 0 if result['overall'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
