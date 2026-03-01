#!/usr/bin/env python3
"""
OpenGNT ETL — extract NT morphology, syntax, variants, and discourse boundaries
from the Open Greek New Testament Project (OGNT v3).

Downloads source files from GitHub, parses ~138K word rows across 4 data layers,
and outputs numbered SQL seed files with multi-row INSERTs.

Usage:
    cd server && python3 scripts/extract-opengnt.py

Output:
    d1-seed/morphology-nt-{NNN}.sql         (NT morphology, ~138K words)
    d1-seed/syntax-{NNN}.sql                (OpenText clause annotations)
    d1-seed/variants-{NNN}.sql              (textual variant markers)
    d1-seed/discourse-boundaries-{NNN}.sql  (Levinsohn discourse boundaries)

Sources:
    Eliran Wong / Open Greek New Testament Project (CC BY-SA 4.0)
    STEP Bible / Tyndale House, Cambridge (CC BY 4.0)
    OpenText.org / Porter, O'Donnell, Reed (CC BY-SA 4.0)
    CrossWire Bible Society / Robinson RMAC (CC BY-SA 3.0)
"""

import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

# ─── Source URLs ──────────────────────────────────────────────────────────────
GITHUB_RAW = "https://raw.githubusercontent.com/eliranwong/OpenGNT/master"
BASE_TEXT_URL = f"{GITHUB_RAW}/OpenGNT_BASE_TEXT.zip"
KEYED_FEATURES_URL = f"{GITHUB_RAW}/OpenGNT_keyedFeatures.csv.zip"
OPENTEXT_URL = (
    f"{GITHUB_RAW}/mapping_OpenTextAnnotations/"
    "OpenGNT_OpenTextAnnotations_English_html.csv.zip"
)

BATCH_SIZE = 100        # rows per INSERT statement
ROWS_PER_FILE = 5000    # rows per SQL seed file

# ─── NT book mapping (OGNT codes 40-66 → canonical names) ────────────────────
NT_BOOK_MAP = {
    40: "matthew", 41: "mark", 42: "luke", 43: "john", 44: "acts",
    45: "romans", 46: "1_corinthians", 47: "2_corinthians", 48: "galatians",
    49: "ephesians", 50: "philippians", 51: "colossians",
    52: "1_thessalonians", 53: "2_thessalonians",
    54: "1_timothy", 55: "2_timothy", 56: "titus", 57: "philemon",
    58: "hebrews", 59: "james", 60: "1_peter", 61: "2_peter",
    62: "1_john", 63: "2_john", 64: "3_john", 65: "jude", 66: "revelation",
}

# ─── RMAC POS mapping ────────────────────────────────────────────────────────
RMAC_POS_FIRST_CHAR = {
    "V": "verb", "N": "noun", "A": "adjective", "T": "determiner",
    "P": "pronoun", "R": "pronoun", "C": "pronoun", "D": "pronoun",
    "K": "pronoun", "I": "pronoun", "X": "pronoun", "F": "pronoun",
    "S": "pronoun", "Q": "pronoun",
}
RMAC_BARE_CODES = {
    "CONJ": "conjunction", "COND": "conjunction", "PRT": "particle",
    "PREP": "preposition", "ADV": "adverb", "INJ": "interjection",
    "HEB": "foreign", "ARAM": "foreign",
}

# ─── Louw-Nida Domain Labels (93 domains) ────────────────────────────────────
LN_DOMAINS = {
    1: "Geographical Objects and Features",
    2: "Natural Substances",
    3: "Plants",
    4: "Animals",
    5: "Foods and Condiments",
    6: "Artifacts",
    7: "Constructions",
    8: "Body, Body Parts, and Body Products",
    9: "People",
    10: "Kinship Terms",
    11: "Groups and Classes of Persons and Members of Such Groups",
    12: "Supernatural Beings and Powers",
    13: "Be, Become, Exist, Happen",
    14: "Physical Events and States",
    15: "Linear Movement",
    16: "Non-Linear Movement",
    17: "Stances and Events Related to Stances",
    18: "Attachment",
    19: "Physical Impact",
    20: "Violence, Harm, Destroy, Kill",
    21: "Danger, Risk, Safe, Save",
    22: "Trouble, Hardship, Relief, Favorable Circumstances",
    23: "Physiological Processes and States",
    24: "Sensory Events and States",
    25: "Attitudes and Emotions",
    26: "Psychological Faculties",
    27: "Learn",
    28: "Know",
    29: "Memory and Recall",
    30: "Think",
    31: "Hold a View, Believe, Trust",
    32: "Understand",
    33: "Communication",
    34: "Association",
    35: "Help, Care For",
    36: "Guide, Discipline, Follow",
    37: "Control, Rule",
    38: "Punish, Reward",
    39: "Hostility, Strife",
    40: "Reconciliation, Forgiveness",
    41: "Behavior and Related States",
    42: "Perform, Do",
    43: "Agriculture",
    44: "Animal Husbandry, Fishing",
    45: "Building, Tearing Down",
    46: "Household Activities",
    47: "Activities Involving Liquids or Masses",
    48: "Activities Involving Cloth",
    49: "Activities Involving Clothing and Adorning",
    50: "Activities Involving Movement of the Whole Body",
    51: "Activities Involving the Head and Extremities",
    52: "Activities Involving Speech",
    53: "Religious Activities",
    54: "Maritime Activities",
    55: "Military Activities",
    56: "Courts and Legal Procedures",
    57: "Possess, Transfer, Exchange",
    58: "Nature, Class, Example",
    59: "Quantity",
    60: "Number",
    61: "Sequence",
    62: "Arrange, Organize",
    63: "Whole, Unite, Part, Divide",
    64: "Comparison",
    65: "Value",
    66: "Proper, Fitting",
    67: "Time",
    68: "Aspect",
    69: "Affirmation, Negation",
    70: "Real, Unreal",
    71: "Mode",
    72: "True, False",
    73: "Genuine, Phony",
    74: "Able, Capable",
    75: "Adequate, Qualified",
    76: "Difficulty, Ease",
    77: "Cause, Means, Effect",
    78: "Space",
    79: "Features of Objects",
    80: "Weight",
    81: "Spatial Dimensions",
    82: "Spatial Orientations",
    83: "Spatial Relations",
    84: "Temporal Relations",
    85: "Manner",
    86: "Degree",
    87: "Status",
    88: "Moral and Ethical Qualities and Related Behavior",
    89: "Relations",
    90: "Case",
    91: "Discourse Markers",
    92: "Discourse Referentials",
    93: "Names of Persons and Places",
}


# ─── Utility Functions ────────────────────────────────────────────────────────

def sql_escape(val) -> str:
    """Escape a value for SQL insertion."""
    if val is None:
        return "NULL"
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"


def get_rmac_pos(rmac: str) -> str:
    """Map RMAC code to human-readable POS string."""
    if not rmac:
        return "unknown"
    upper = rmac.strip().upper()
    # Bare codes: CONJ, PRT, PREP, ADV, INJ, HEB, ARAM
    if upper in RMAC_BARE_CODES:
        return RMAC_BARE_CODES[upper]
    # Dash-separated: V-PAI-3S, N-NSM, etc. — use first character
    first = upper[0]
    return RMAC_POS_FIRST_CHAR.get(first, "unknown")


def enrich_louw_nida(ln_raw: str) -> tuple:
    """Parse Louw-Nida number(s) and derive domain labels.

    Input: raw L-N string from OGNT Col 8, e.g. "33.69" or "33.69;42.3"
    Returns: (louw_nida, louw_nida_domain)
      louw_nida: the raw number(s) as-is
      louw_nida_domain: domain label(s), e.g. "33: Communication"
    """
    if not ln_raw or ln_raw.strip() == "":
        return None, None

    clean = ln_raw.strip()
    # May contain multiple entries separated by ; or , or fullwidth comma ，(U+FF0C)
    parts = re.split(r"[;,\uff0c]", clean)
    domains_seen = {}
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Extract domain number: "33.69" → 33, "33" → 33
        match = re.match(r"(\d+)", part)
        if match:
            domain_num = int(match.group(1))
            if domain_num in LN_DOMAINS and domain_num not in domains_seen:
                domains_seen[domain_num] = LN_DOMAINS[domain_num]

    if not domains_seen:
        return clean, None

    domain_labels = "; ".join(
        f"{num}: {label}" for num, label in sorted(domains_seen.items())
    )
    return clean, domain_labels


# ─── Download Functions ───────────────────────────────────────────────────────

def download_file(url: str, dest: Path) -> Path:
    """Download a file from URL if not already cached."""
    if dest.exists():
        print(f"  Cached: {dest.name}")
        return dest

    print(f"  Downloading: {url.split('/')[-1]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "claude-of-alexandria-etl/1.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as out:
        total = 0
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            out.write(chunk)
            total += len(chunk)
    print(f"    Downloaded {total / 1024:.0f} KB")
    return dest


def extract_csv_from_zip(zip_path: Path) -> str:
    """Extract the first CSV file from a ZIP archive, return content as string."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
        if not csv_names:
            raise ValueError(f"No CSV found in {zip_path}")
        name = csv_names[0]
        print(f"    Extracting: {name}")
        with zf.open(name) as f:
            return f.read().decode("utf-8")


# ─── Parsing Functions ────────────────────────────────────────────────────────

def split_subfields(col: str) -> list[str]:
    """Split a bracketed sub-field column using fullwidth delimiters.

    OGNT uses fullwidth brackets 〔〕 (U+3014/U+3015) and fullwidth pipe ｜ (U+FF5C).
    Example: 〔40｜1｜1〕 → ["40", "1", "1"]
    """
    # Strip fullwidth brackets
    s = col.strip()
    s = s.lstrip("\u3014").rstrip("\u3015")
    # Split on fullwidth pipe
    return [p.strip() for p in s.split("\uff5c")]


def parse_base_text(content: str) -> list[dict]:
    """Parse OpenGNT_version3_3.csv (13-column TAB-separated).

    Column layout (0-indexed):
      0: OGNTsort
      1: TANTTsort
      2: FEATURESsort1 (join key to keyedFeatures)
      3: LevinsohnClauseID
      4: OTquotation
      5: 〔BGBsortI｜LTsortI｜STsortI〕
      6: 〔Book｜Chapter｜Verse〕
      7: 〔OGNTk｜OGNTu｜OGNTa｜lexeme｜rmac｜sn〕
      8: 〔BDAG｜EDNT｜Mounce｜GK｜LN-LouwNidaNumbers〕
      9: 〔transSBLcap｜transSBL｜modernGreek｜Fonética〕
     10: 〔TBESG｜IT｜LT｜ST｜Español〕
     11: 〔PMpWord｜PMfWord〕
     12: 〔Note｜Mvar｜Mlexeme｜Mrmac｜Msn｜MTBESG〕

    Sub-fields use fullwidth pipe ｜ (U+FF5C) inside fullwidth brackets 〔〕.

    Returns list of word dicts.
    """
    words = []
    lines = content.split("\n")
    print(f"  BASE_TEXT: {len(lines)} lines")

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        cols = line.split("\t")
        if len(cols) < 8:
            continue

        # Skip header line
        if cols[0] == "OGNTsort":
            continue

        # Col 0: OGNTsort
        ognt_sort = cols[0].strip()
        # Col 2: FEATURESsort1 (join key)
        features_sort1 = cols[2].strip()
        # Col 3: LevinsohnClauseID
        lev_clause_id = cols[3].strip() if len(cols) > 3 else ""

        # Col 6: 〔Book｜Chapter｜Verse〕
        ref_parts = split_subfields(cols[6])
        if len(ref_parts) < 3:
            continue
        try:
            book_code = int(ref_parts[0])
            chapter = int(ref_parts[1])
            verse = int(ref_parts[2])
        except (ValueError, IndexError):
            continue

        if book_code not in NT_BOOK_MAP:
            continue

        # Col 7: 〔OGNTk｜OGNTu｜OGNTa｜lexeme｜rmac｜sn〕
        col7 = split_subfields(cols[7])
        if len(col7) < 6:
            continue
        # ogntk = col7[0]     # Koine font
        ogntu = col7[1]        # unaccented
        ognta = col7[2]        # accented
        lexeme = col7[3]       # lemma
        rmac = col7[4]         # RMAC code (before sn in actual data)
        sn = col7[5]           # Extended Strong's number

        # Col 8: 〔BDAG｜EDNT｜Mounce｜GK｜LN-LouwNidaNumbers〕
        ln_raw = ""
        if len(cols) > 8:
            col8 = split_subfields(cols[8])
            if len(col8) >= 5:
                # L-N field has "LN-" prefix, e.g. "LN-33.38" or "LN-10.24，33.19"
                ln_field = col8[4]
                if ln_field.startswith("LN-"):
                    ln_raw = ln_field[3:]  # strip "LN-" prefix
                else:
                    ln_raw = ln_field

        # Col 10: 〔TBESG｜IT｜LT｜ST｜Español〕 — fallback for TBESG gloss
        tbesg_base = ""
        if len(cols) > 10:
            col10 = split_subfields(cols[10])
            if col10:
                tbesg_base = col10[0]

        # Col 12: 〔Note｜Mvar｜Mlexeme｜Mrmac｜Msn｜MTBESG〕
        variant_note = ""
        variant_text = ""
        variant_lexeme = ""
        variant_sn = ""
        variant_rmac = ""
        if len(cols) > 12:
            col12 = split_subfields(cols[12])
            if len(col12) >= 1:
                variant_note = col12[0]
            if len(col12) >= 2:
                variant_text = col12[1]
            if len(col12) >= 3:
                variant_lexeme = col12[2]
            if len(col12) >= 4:
                variant_rmac = col12[3]
            if len(col12) >= 5:
                variant_sn = col12[4]

        # Ensure Strong's has G prefix
        if sn and not sn.startswith("G"):
            sn = f"G{sn}"

        pos = get_rmac_pos(rmac)

        words.append({
            "ognt_sort": ognt_sort,
            "features_sort1": features_sort1,
            "lev_clause_id": lev_clause_id,
            "book_code": book_code,
            "book": NT_BOOK_MAP[book_code],
            "chapter": chapter,
            "verse": verse,
            "text": ognta,          # accented form
            "normalized": ogntu,     # unaccented form
            "lemma": lexeme,
            "strongs": sn,
            "rmac": rmac,
            "pos": pos,
            "ln_raw": ln_raw,
            "tbesg_base": tbesg_base,  # from base text Col 10
            "variant_note": variant_note,
            "variant_text": variant_text,
            "variant_lexeme": variant_lexeme,
            "variant_sn": variant_sn,
            "variant_rmac": variant_rmac,
        })

    print(f"  Parsed {len(words)} NT words")
    return words


def parse_keyed_features(content: str) -> dict:
    """Parse OpenGNT_keyedFeatures.csv (11-column TAB-separated).

    Column layout (0-indexed):
      0: FEATURESsort1 (join key)
      1: FEATURESsort2
      2: mapIDV2
      3: mapIDV1
      4: 〔book｜chapter｜verse〕
      5: 〔OGNTsort｜TANTTsort｜OpenTextWord_KEY〕
      6: 〔LevinsohnWord_KEY｜noteMarker｜noteMarkerExclClause｜clause｜clauseID｜
          otQuotation｜reportedSpeech｜embeddedReportedSpeech〕
      7: 〔TANTT〕 — edition comparison data
      8: 〔MounceGloss｜TyndaleHouseGloss｜OpenGNTGloss〕
      9: 〔BGBsortI｜LTsortI｜STsortI〕
     10: 〔TBESG｜IT｜LT｜ST｜Español〕

    Returns dict: FEATURESsort1 → feature dict.
    """
    features = {}
    lines = content.split("\n")
    print(f"  KEYED_FEATURES: {len(lines)} lines")

    # Special mapping-only entries to skip (NA27-based resources only)
    SKIP_ENTRIES = {
        "122580", "122586", "122796", "123928", "123948",
        "124712", "125108", "125238", "127544", "127800",
        "128058", "128061",
    }

    for line in lines:
        line = line.strip()
        if not line:
            continue

        cols = line.split("\t")
        if len(cols) < 9:
            continue

        feat_sort1 = cols[0].strip()
        if feat_sort1 == "FEATURESsort1":  # skip header
            continue
        if feat_sort1 in SKIP_ENTRIES:
            continue

        # Col 6: Levinsohn discourse data
        lev_data = {}
        if len(cols) > 6:
            col6 = split_subfields(cols[6])
            lev_data = {
                "note_marker": col6[1] if len(col6) > 1 else "",
                "clause": col6[3] if len(col6) > 3 else "",
                "clause_id": col6[4] if len(col6) > 4 else "",
                "ot_quotation": col6[5] if len(col6) > 5 else "",
                "reported_speech": col6[6] if len(col6) > 6 else "",
                "embedded_speech": col6[7] if len(col6) > 7 else "",
            }

        # Col 7: TANTT edition comparison data
        tantt_raw = ""
        if len(cols) > 7:
            tantt_raw = cols[7].strip().lstrip("\u3014").rstrip("\u3015")

        # Col 8: 〔MounceGloss｜TyndaleHouseGloss｜OpenGNTGloss〕
        gloss = ""
        gloss_tbesg = ""
        if len(cols) > 8:
            col8 = split_subfields(cols[8])
            # MounceGloss (index 0) excluded — non-commercial license
            if len(col8) >= 2:
                gloss_tbesg = col8[1]
            if len(col8) >= 3:
                gloss = col8[2]

        features[feat_sort1] = {
            "gloss": gloss,
            "gloss_tbesg": gloss_tbesg,
            "tantt": tantt_raw,
            **lev_data,
        }

    print(f"  Parsed {len(features)} feature entries")
    return features


def parse_opentext_annotations(content: str) -> list[dict]:
    """Parse OpenText clause-level annotations CSV.

    Returns list of clause dicts for syntax_annotations table.
    """
    annotations = []
    lines = content.split("\n")
    print(f"  OPENTEXT: {len(lines)} lines")

    if len(lines) < 2:
        print("  WARNING: OpenText file appears empty")
        return annotations

    # Detect header to understand column structure
    header = lines[0].strip()
    header_cols = header.split("\t")
    print(f"    Header columns ({len(header_cols)}): {header_cols[:10]}...")

    # Parse based on detected format
    # Expected structure: word-level annotations with clause assignments
    # We aggregate to clause-level entries
    clause_map = {}  # clause_id → annotation data

    for i, line in enumerate(lines[1:], start=2):
        line = line.strip()
        if not line:
            continue

        cols = line.split("\t")
        if len(cols) < 5:
            continue

        try:
            # Try to extract reference and clause information
            # The actual format needs to be determined from the data
            # Typical OpenText format: word_id, book, chapter, verse, clause_id,
            #                          clause_type, clause_relation, word_group_role, text
            # We'll detect the format from the header and data

            # For now, collect raw rows and we'll process them after
            # seeing the actual data format
            annotations.append(cols)
        except Exception:
            continue

    print(f"  Collected {len(annotations)} raw OpenText rows")
    return annotations


# ─── Enrichment Functions ─────────────────────────────────────────────────────

def assign_word_positions(words: list[dict]) -> list[dict]:
    """Assign sequential word_position within each verse."""
    current_key = None
    pos_counter = 0

    for w in words:
        key = (w["book_code"], w["chapter"], w["verse"])
        if key != current_key:
            current_key = key
            pos_counter = 1
        else:
            pos_counter += 1
        w["word_position"] = pos_counter

    return words


def enrich_with_features(words: list[dict], features: dict) -> list[dict]:
    """Join base_text words with keyedFeatures data using FEATURESsort1."""
    matched = 0
    for w in words:
        feat = features.get(w["features_sort1"])
        if feat:
            matched += 1
            # Glosses: prefer keyedFeatures, fall back to base text
            w["gloss"] = feat.get("gloss") or None
            tbesg = feat.get("gloss_tbesg") or w.get("tbesg_base") or None
            w["gloss_tbesg"] = tbesg
            # Levinsohn clause assignment
            kf_clause_id = feat.get("clause_id", "")
            if kf_clause_id:
                w["clause_id"] = kf_clause_id
            elif w.get("lev_clause_id"):
                w["clause_id"] = w["lev_clause_id"]
            else:
                w["clause_id"] = None
            # Discourse boundary markers for later extraction
            w["ot_quotation"] = feat.get("ot_quotation", "")
            w["reported_speech"] = feat.get("reported_speech", "")
            w["embedded_speech"] = feat.get("embedded_speech", "")
            w["note_marker"] = feat.get("note_marker", "")
            # TANTT edition data for variant extraction
            w["tantt"] = feat.get("tantt", "")
        else:
            w["gloss"] = None
            w["gloss_tbesg"] = w.get("tbesg_base") or None
            w["clause_id"] = w.get("lev_clause_id") or None
            w["ot_quotation"] = ""
            w["reported_speech"] = ""
            w["embedded_speech"] = ""
            w["note_marker"] = ""
            w["tantt"] = ""

        # Enrich Louw-Nida
        ln, ln_domain = enrich_louw_nida(w.get("ln_raw", ""))
        w["louw_nida"] = ln
        w["louw_nida_domain"] = ln_domain

    print(f"  Feature join: {matched}/{len(words)} matched ({matched * 100 // max(len(words), 1)}%)")
    return words


def extract_discourse_boundaries(words: list[dict]) -> list[dict]:
    """Extract sparse discourse boundary markers from word-level Levinsohn data.

    Marker format uses HTML-like tags:
      <ot>*     = OT quotation start
      *         = within (continuation)
      *</ot>    = OT quotation end
      <ot>*</ot>= single-word OT quotation
    Same pattern for <rs>/</rs> (reported speech) and <ers>/</ers> (embedded).

    Creates rows only at boundaries (start/end), not for every word within.
    """
    boundaries = []

    for w in words:
        book = w["book"]
        chapter = w["chapter"]
        verse = w["verse"]
        word_pos = w["word_position"]
        clause_id = w.get("clause_id")

        ot_quot = w.get("ot_quotation", "")
        speech = w.get("reported_speech", "")
        embedded = w.get("embedded_speech", "")
        note = w.get("note_marker", "")

        base = {
            "book": book, "chapter": chapter, "verse": verse,
            "word_position": word_pos, "clause_id": clause_id,
            "clause_marker": None, "note_text": None,
        }

        # OT quotation boundaries
        if "<ot>" in ot_quot:
            boundaries.append({**base, "boundary_type": "ot_quotation_start"})
        if "</ot>" in ot_quot:
            boundaries.append({**base, "boundary_type": "ot_quotation_end"})

        # Reported speech boundaries
        if "<rs>" in speech:
            boundaries.append({**base, "boundary_type": "speech_start"})
        if "</rs>" in speech:
            boundaries.append({**base, "boundary_type": "speech_end"})

        # Embedded speech boundaries
        if "<ers>" in embedded:
            boundaries.append({**base, "boundary_type": "embedded_speech_start"})
        if "</ers>" in embedded:
            boundaries.append({**base, "boundary_type": "embedded_speech_end"})

        # Levinsohn note markers
        if note:
            boundaries.append({
                **base, "boundary_type": "note", "note_text": note,
            })

    print(f"  Discourse boundaries: {len(boundaries)} boundary events extracted")
    return boundaries


ALL_EDITIONS = "BIMNRSTWH"
EDITION_NAMES = {
    "B": "Byzantine", "I": "NIV Greek", "N": "NA27", "M": "NA28",
    "R": "Textus Receptus", "S": "SBLGNT", "T": "Tregelles",
    "W": "Westcott-Hort", "H": "Tyndale House GNT",
}


def parse_tantt_editions(tantt: str) -> list[dict]:
    """Parse TANTT edition comparison data.

    Format: "BIMNRSTWH=Βίβλος=G0976=N-NSF;" (all agree)
    Or: "IMNW=Χριστοῦ=G5547=N-GSM-T; BRSTH=χριστοῦ=G5547=N-GSM-T;" (disagree)

    Returns list of reading groups: [{editions: "IMNW", text: "Χριστοῦ", ...}]
    """
    if not tantt:
        return []

    groups = []
    for part in tantt.split(";"):
        part = part.strip()
        if not part:
            continue
        # Format: EDITIONS=text=strongs=rmac
        pieces = part.split("=")
        if len(pieces) >= 2:
            groups.append({
                "editions": pieces[0],
                "text": pieces[1] if len(pieces) > 1 else "",
                "strongs": pieces[2] if len(pieces) > 2 else "",
                "rmac": pieces[3] if len(pieces) > 3 else "",
            })
    return groups


def extract_variants(words: list[dict]) -> list[dict]:
    """Extract textual variant markers from TANTT edition comparison data.

    Uses keyedFeatures Col 7 (TANTT) for per-edition agreement data.
    Creates rows only for words where editions disagree (multiple reading groups).
    """
    variants = []
    for w in words:
        tantt = w.get("tantt", "")
        if not tantt:
            continue

        groups = parse_tantt_editions(tantt)
        if len(groups) <= 1:
            # All editions agree — no variant
            continue

        # Multiple reading groups — editions disagree
        # The OGNT text is the main reading; other groups are variants
        ognt_text = w["text"]

        # Build editions JSON: which editions have which reading
        # Find the group matching OGNT text
        ognt_group = None
        variant_groups = []
        for g in groups:
            if g["text"] == ognt_text or g["text"] == w.get("normalized", ""):
                ognt_group = g
            else:
                variant_groups.append(g)

        if not ognt_group:
            # OGNT text not found in groups — use first group as main
            ognt_group = groups[0]
            variant_groups = groups[1:]

        # Build editions object
        editions = {}
        for ch in ognt_group["editions"]:
            if ch in EDITION_NAMES:
                editions[ch] = True
        for vg in variant_groups:
            for ch in vg["editions"]:
                if ch in EDITION_NAMES:
                    editions[ch] = False

        if not editions:
            continue

        # Determine variant type
        variant_type = "substitution"  # Most common: different spelling/form
        variant_texts = [vg["text"] for vg in variant_groups if vg["text"]]
        variant_text = "; ".join(variant_texts) if variant_texts else None

        editions_json = json.dumps(editions, separators=(",", ":"))

        variants.append({
            "book": w["book"],
            "chapter": w["chapter"],
            "verse": w["verse"],
            "word_position": w["word_position"],
            "ognt_text": ognt_text,
            "editions": editions_json,
            "variant_type": variant_type,
            "variant_text": variant_text,
        })

    print(f"  Variants: {len(variants)} variant markers extracted")
    return variants


# ─── SQL Generation ───────────────────────────────────────────────────────────

def write_morphology_sql(words: list[dict], output_dir: Path) -> None:
    """Write numbered SQL seed files for NT morphology."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Remove old NT morphology seed files
    for old_file in output_dir.glob("morphology-nt-*.sql"):
        old_file.unlink()

    cols = (
        "book", "testament", "chapter", "verse", "word_position",
        "text", "normalized", "lemma", "pos", "parsing",
        "gloss", "strongs", "clause_id", "clause_type",
        "semantic_frame", "subject_ref", "participant_ref",
        "gloss_tbesg", "louw_nida", "louw_nida_domain",
    )
    col_list = ", ".join(cols)

    file_num = 0
    total_rows = 0
    strongs_missing = 0

    for file_start in range(0, len(words), ROWS_PER_FILE):
        file_num += 1
        file_words = words[file_start:file_start + ROWS_PER_FILE]
        filename = f"morphology-nt-{file_num:03d}.sql"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(
                f"-- OpenGNT NT morphology batch {file_num} "
                f"(rows {file_start + 1}-{file_start + len(file_words)})\n"
                f"-- Source: Eliran Wong / OGNT v3 (CC BY-SA 4.0)\n\n"
            )

            for batch_start in range(0, len(file_words), BATCH_SIZE):
                batch = file_words[batch_start:batch_start + BATCH_SIZE]
                f.write(f"INSERT INTO morphology ({col_list}) VALUES\n")

                rows = []
                for w in batch:
                    # Validate strongs NOT NULL
                    strongs = w.get("strongs")
                    if not strongs:
                        strongs_missing += 1

                    vals = (
                        sql_escape(w["book"]),
                        "'nt'",
                        str(w["chapter"]),
                        str(w["verse"]),
                        str(w["word_position"]),
                        sql_escape(w["text"]),
                        sql_escape(w["normalized"]),
                        sql_escape(w["lemma"]),
                        sql_escape(w["pos"]),
                        sql_escape(w["rmac"]),         # raw RMAC string
                        sql_escape(w.get("gloss")),
                        sql_escape(strongs),
                        sql_escape(w.get("clause_id")),
                        "NULL",  # clause_type (OT-only)
                        "NULL",  # semantic_frame (OT-only)
                        "NULL",  # subject_ref (OT-only)
                        "NULL",  # participant_ref (OT-only)
                        sql_escape(w.get("gloss_tbesg")),
                        sql_escape(w.get("louw_nida")),
                        sql_escape(w.get("louw_nida_domain")),
                    )
                    rows.append(f"  ({', '.join(vals)})")

                f.write(",\n".join(rows))
                f.write(";\n\n")

            total_rows += len(file_words)

    if strongs_missing > 0:
        print(f"  WARNING: {strongs_missing} words missing Strong's numbers")
    print(f"  Morphology: {total_rows} rows across {file_num} files")


def write_variants_sql(variants: list[dict], output_dir: Path) -> None:
    """Write numbered SQL seed files for textual variants."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for old_file in output_dir.glob("variants-*.sql"):
        old_file.unlink()

    if not variants:
        print("  Variants: no data to write")
        return

    cols = (
        "book", "chapter", "verse", "word_position",
        "ognt_text", "editions", "variant_type", "variant_text",
    )
    col_list = ", ".join(cols)

    file_num = 0
    total_rows = 0

    for file_start in range(0, len(variants), ROWS_PER_FILE):
        file_num += 1
        file_data = variants[file_start:file_start + ROWS_PER_FILE]
        filename = f"variants-{file_num:03d}.sql"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(
                f"-- Textual variants batch {file_num} "
                f"(rows {file_start + 1}-{file_start + len(file_data)})\n"
                f"-- Source: Eliran Wong / OGNT v3 (CC BY-SA 4.0)\n\n"
            )

            for batch_start in range(0, len(file_data), BATCH_SIZE):
                batch = file_data[batch_start:batch_start + BATCH_SIZE]
                f.write(f"INSERT INTO textual_variants ({col_list}) VALUES\n")

                rows = []
                for v in batch:
                    vals = (
                        sql_escape(v["book"]),
                        str(v["chapter"]),
                        str(v["verse"]),
                        str(v["word_position"]),
                        sql_escape(v["ognt_text"]),
                        sql_escape(v["editions"]),
                        sql_escape(v["variant_type"]),
                        sql_escape(v["variant_text"]),
                    )
                    rows.append(f"  ({', '.join(vals)})")

                f.write(",\n".join(rows))
                f.write(";\n\n")

            total_rows += len(file_data)

    print(f"  Variants: {total_rows} rows across {file_num} files")


def write_discourse_boundaries_sql(boundaries: list[dict], output_dir: Path) -> None:
    """Write numbered SQL seed files for discourse boundaries."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for old_file in output_dir.glob("discourse-boundaries-*.sql"):
        old_file.unlink()

    if not boundaries:
        print("  Discourse boundaries: no data to write")
        return

    cols = (
        "book", "chapter", "verse", "word_position",
        "boundary_type", "clause_id", "clause_marker", "note_text",
    )
    col_list = ", ".join(cols)

    file_num = 0
    total_rows = 0

    for file_start in range(0, len(boundaries), ROWS_PER_FILE):
        file_num += 1
        file_data = boundaries[file_start:file_start + ROWS_PER_FILE]
        filename = f"discourse-boundaries-{file_num:03d}.sql"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(
                f"-- Levinsohn discourse boundaries batch {file_num} "
                f"(rows {file_start + 1}-{file_start + len(file_data)})\n"
                f"-- Source: SIL International / Levinsohn GNTDF (2016)\n\n"
            )

            for batch_start in range(0, len(file_data), BATCH_SIZE):
                batch = file_data[batch_start:batch_start + BATCH_SIZE]
                f.write(f"INSERT INTO discourse_boundaries ({col_list}) VALUES\n")

                rows = []
                for b in batch:
                    vals = (
                        sql_escape(b["book"]),
                        str(b["chapter"]),
                        str(b["verse"]),
                        str(b["word_position"]),
                        sql_escape(b["boundary_type"]),
                        sql_escape(b.get("clause_id")),
                        sql_escape(b.get("clause_marker")),
                        sql_escape(b.get("note_text")),
                    )
                    rows.append(f"  ({', '.join(vals)})")

                f.write(",\n".join(rows))
                f.write(";\n\n")

            total_rows += len(file_data)

    print(f"  Discourse boundaries: {total_rows} rows across {file_num} files")


def write_syntax_sql(raw_rows: list, output_dir: Path) -> None:
    """Write numbered SQL seed files for OpenText syntax annotations.

    Processes raw rows from OpenText CSV into clause-level entries.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    for old_file in output_dir.glob("syntax-*.sql"):
        old_file.unlink()

    if not raw_rows:
        print("  Syntax: no data to write (OpenText parsing deferred)")
        return

    # The OpenText CSV format needs inspection — the actual column structure
    # varies. For now, log what we found and handle it.
    print(f"  Syntax: {len(raw_rows)} raw rows collected")
    print(f"    First row sample ({len(raw_rows[0])} cols): {raw_rows[0][:5]}")

    # Attempt to parse based on detected structure
    # OpenText annotations are HTML-formatted clause data
    # The exact parsing depends on the CSV structure
    annotations = _process_opentext_rows(raw_rows)

    if not annotations:
        print("  Syntax: could not parse annotations (format TBD)")
        return

    cols = (
        "book", "chapter", "verse", "clause_id",
        "clause_type", "clause_relation", "clause_text",
        "word_groups", "parent_clause_id",
    )
    col_list = ", ".join(cols)

    file_num = 0
    total_rows = 0

    for file_start in range(0, len(annotations), ROWS_PER_FILE):
        file_num += 1
        file_data = annotations[file_start:file_start + ROWS_PER_FILE]
        filename = f"syntax-{file_num:03d}.sql"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(
                f"-- OpenText syntax annotations batch {file_num} "
                f"(rows {file_start + 1}-{file_start + len(file_data)})\n"
                f"-- Source: OpenText.org / Porter, O'Donnell, Reed "
                f"(CC BY-SA 4.0)\n\n"
            )

            for batch_start in range(0, len(file_data), BATCH_SIZE):
                batch = file_data[batch_start:batch_start + BATCH_SIZE]
                f.write(f"INSERT INTO syntax_annotations ({col_list}) VALUES\n")

                rows = []
                for a in batch:
                    vals = (
                        sql_escape(a["book"]),
                        str(a["chapter"]),
                        str(a["verse"]),
                        sql_escape(a.get("clause_id")),
                        sql_escape(a["clause_type"]),
                        sql_escape(a.get("clause_relation")),
                        sql_escape(a.get("clause_text")),
                        sql_escape(a.get("word_groups")),
                        sql_escape(a.get("parent_clause_id")),
                    )
                    rows.append(f"  ({', '.join(vals)})")

                f.write(",\n".join(rows))
                f.write(";\n\n")

            total_rows += len(file_data)

    print(f"  Syntax: {total_rows} rows across {file_num} files")


def _process_opentext_rows(raw_rows: list) -> list[dict]:
    """Attempt to process OpenText annotation rows into structured data.

    The OpenText CSV uses HTML formatting for clause annotations.
    We need to extract clause structure from the HTML content.
    """
    if not raw_rows:
        return []

    # Detect format from first few rows
    sample = raw_rows[0]

    # OpenText annotations typically have columns:
    # OGNTsort, TANTTsort, BookChapterVerse, ClauseType, Role, Text, ...
    # The exact format needs to be determined empirically

    annotations = []
    clause_map = {}

    for row in raw_rows:
        try:
            if len(row) < 6:
                continue

            # Try to extract reference and clause data
            # Column positions depend on the actual CSV format
            # We'll look for book|chapter|verse patterns
            ref_col = None
            for idx, col in enumerate(row):
                if re.match(r"\d+\|\d+\|\d+", col):
                    ref_col = idx
                    break

            if ref_col is None:
                continue

            ref_parts = row[ref_col].split("|")
            book_code = int(ref_parts[0])
            chapter = int(ref_parts[1])
            verse = int(ref_parts[2])

            if book_code not in NT_BOOK_MAP:
                continue

            book = NT_BOOK_MAP[book_code]

            # Extract clause information from surrounding columns
            # This is format-dependent and needs empirical verification
            clause_type = row[ref_col + 1].strip() if ref_col + 1 < len(row) else ""
            clause_text = row[ref_col + 2].strip() if ref_col + 2 < len(row) else ""

            # Strip HTML tags from clause text
            clause_text = re.sub(r"<[^>]+>", "", clause_text)

            if not clause_type:
                continue

            # Normalize clause type
            ct_lower = clause_type.lower()
            if "primary" in ct_lower:
                norm_type = "primary"
            elif "secondary" in ct_lower:
                norm_type = "secondary"
            elif "embed" in ct_lower:
                norm_type = "embedded"
            else:
                norm_type = clause_type

            clause_key = f"{book}.{chapter}.{verse}.{len(annotations)}"

            annotations.append({
                "book": book,
                "chapter": chapter,
                "verse": verse,
                "clause_id": clause_key,
                "clause_type": norm_type,
                "clause_relation": None,
                "clause_text": clause_text if clause_text else None,
                "word_groups": None,
                "parent_clause_id": None,
            })

        except (ValueError, IndexError):
            continue

    return annotations


# ─── Verification ─────────────────────────────────────────────────────────────

def verify_john_1_1(words: list[dict]) -> None:
    """Spot-check John 1:1 data quality."""
    print("\nVerification — John 1:1:")
    john_words = [
        w for w in words
        if w["book"] == "john" and w["chapter"] == 1 and w["verse"] == 1
    ]

    if not john_words:
        print("  ERROR: No words found for John 1:1")
        return

    print(f"  Word count: {len(john_words)}")

    for w in john_words[:5]:
        print(
            f"  [{w['word_position']}] {w['text']}"
            f"  lemma={w['lemma']!r}"
            f"  pos={w['pos']}"
            f"  rmac={w['rmac']!r}"
            f"  strongs={w['strongs']!r}"
        )

    # Check for logos (λόγος) — should be present
    logos_words = [
        w for w in john_words
        if w["lemma"] and "λόγ" in w["lemma"]
    ]
    if logos_words:
        lw = logos_words[0]
        print(
            f"  λόγος check: gloss={lw.get('gloss')!r}"
            f"  tbesg={lw.get('gloss_tbesg')!r}"
            f"  ln={lw.get('louw_nida')!r}"
            f"  domain={lw.get('louw_nida_domain')!r}"
        )
        status = "PASS" if lw.get("strongs") else "FAIL"
        print(f"    Strong's: {lw.get('strongs')!r} [{status}]")
    else:
        print("  λόγος: NOT FOUND — check lexeme matching")

    # Check Strong's completeness
    missing_strongs = sum(1 for w in john_words if not w.get("strongs"))
    status = "PASS" if missing_strongs == 0 else f"FAIL ({missing_strongs} missing)"
    print(f"  Strong's completeness: [{status}]")

    # Check gloss join
    with_gloss = sum(1 for w in john_words if w.get("gloss"))
    print(f"  Gloss coverage: {with_gloss}/{len(john_words)}")


def print_summary(words, variants, boundaries) -> None:
    """Print extraction summary statistics."""
    print("\n=== Summary ===")
    total = len(words)
    print(f"  NT morphology: {total} words")

    if total == 0:
        print("  ERROR: No words parsed — check CSV format")
        return

    # Book distribution
    book_counts = {}
    for w in words:
        book_counts[w["book"]] = book_counts.get(w["book"], 0) + 1
    print(f"  Books: {len(book_counts)}")
    for book, count in sorted(book_counts.items(), key=lambda x: -x[1])[:5]:
        print(f"    {book}: {count} words")

    # Gloss coverage
    with_gloss = sum(1 for w in words if w.get("gloss"))
    with_tbesg = sum(1 for w in words if w.get("gloss_tbesg"))
    with_ln = sum(1 for w in words if w.get("louw_nida"))
    with_clause = sum(1 for w in words if w.get("clause_id"))
    print(f"  OpenGNT gloss: {with_gloss}/{total} ({with_gloss * 100 // total}%)")
    print(f"  TBESG gloss: {with_tbesg}/{total} ({with_tbesg * 100 // total}%)")
    print(f"  Louw-Nida: {with_ln}/{total} ({with_ln * 100 // total}%)")
    print(f"  Clause ID: {with_clause}/{total} ({with_clause * 100 // total}%)")

    print(f"  Variants: {len(variants)} markers")
    print(f"  Discourse boundaries: {len(boundaries)} events")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    script_dir = Path(__file__).parent
    server_dir = script_dir.parent
    cache_dir = server_dir / ".cache"
    output_dir = server_dir / "d1-seed"

    cache_dir.mkdir(parents=True, exist_ok=True)

    print("=== OpenGNT ETL ===\n")

    # Step 1: Download source files
    print("Step 1: Downloading source files...")
    base_zip = download_file(BASE_TEXT_URL, cache_dir / "OpenGNT_BASE_TEXT.zip")
    feat_zip = download_file(KEYED_FEATURES_URL, cache_dir / "OpenGNT_keyedFeatures.csv.zip")

    opentext_zip = None
    try:
        opentext_zip = download_file(OPENTEXT_URL, cache_dir / "OpenGNT_OpenTextAnnotations.csv.zip")
    except Exception as e:
        print(f"  WARNING: Could not download OpenText annotations: {e}")
        print("  Syntax annotations will be skipped")

    # Step 2: Extract CSVs from ZIPs
    print("\nStep 2: Extracting CSV data...")
    base_content = extract_csv_from_zip(base_zip)
    feat_content = extract_csv_from_zip(feat_zip)

    opentext_content = None
    if opentext_zip:
        try:
            opentext_content = extract_csv_from_zip(opentext_zip)
        except Exception as e:
            print(f"  WARNING: Could not extract OpenText CSV: {e}")

    # Step 3: Parse source data
    print("\nStep 3: Parsing source data...")
    words = parse_base_text(base_content)
    features = parse_keyed_features(feat_content)

    opentext_rows = []
    if opentext_content:
        opentext_rows = parse_opentext_annotations(opentext_content)

    # Step 4: Assign word positions
    print("\nStep 4: Assigning word positions...")
    words = assign_word_positions(words)

    # Step 5: Enrich with features (glosses, clause IDs, L-N)
    print("\nStep 5: Enriching with keyed features...")
    words = enrich_with_features(words, features)

    # Step 6: Verify data quality
    verify_john_1_1(words)

    # Step 7: Extract auxiliary data
    print("\nStep 7: Extracting auxiliary data...")
    boundaries = extract_discourse_boundaries(words)
    variants = extract_variants(words)

    # Step 8: Print summary
    print_summary(words, variants, boundaries)

    # Step 9: Validate — Strong's NOT NULL for every word
    missing_strongs = sum(1 for w in words if not w.get("strongs"))
    if missing_strongs > 0:
        print(
            f"\nWARNING: {missing_strongs} words missing Strong's numbers "
            f"({missing_strongs * 100 // len(words)}%)"
        )
    else:
        print("\nValidation PASS: all words have Strong's numbers")

    # Step 10: Write SQL seed files
    print("\nStep 10: Writing SQL seed files...")
    write_morphology_sql(words, output_dir)
    write_variants_sql(variants, output_dir)
    write_discourse_boundaries_sql(boundaries, output_dir)
    write_syntax_sql(opentext_rows, output_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
