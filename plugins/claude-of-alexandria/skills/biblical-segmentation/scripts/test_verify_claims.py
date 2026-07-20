#!/usr/bin/env python3
"""
Test cases for verify_claims.py — Masoretic paragraph marker verification.

Unlike the sibling test_*.py files in this directory, which drive their
target scripts via subprocess/importlib, this file imports verify_claims.py
directly in-process so that verify_masoretic_marker() can be unit-tested
and (where needed) sefaria_paragraphs.get_paragraph_breaks can be
monkeypatched.

RED Phase (#120): `test_gen1_2_not_pass` and `test_deut2_8_not_pass` fail
against the unfixed verify_masoretic_marker() — both are true false
positives (substring reference match and position-blind matching,
respectively).
GREEN Phase (#120): after the fix, all assertions in this file pass.

Usage:
    python3 -m pytest test_verify_claims.py -v
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

import verify_claims  # noqa: E402

SCRIPT_DIR = Path(__file__).parent
MASORETIC_DIR = SCRIPT_DIR.parent / "reference" / "masoretic"


def _verify(claim_text):
    """Drive claim_text through extract_masoretic_claims() then verify_masoretic_marker()."""
    claims = verify_claims.extract_masoretic_claims(claim_text)
    assert claims, f"extract_masoretic_claims() found no claim in: {claim_text!r}"
    return verify_claims.verify_masoretic_marker(claims[0])


# --- AC-3 Genesis 1 (contains the load-bearing RED: Gen 1:2) ---

def test_gen1_5_passes():
    """Genesis 1:5 carries a genuine petuchah verse_end marker -> PASS."""
    result = _verify("פ at Gen 1:5")
    assert result["status"] == "PASS", result


def test_gen1_2_not_pass():
    """
    Load-bearing RED: on unfixed code, "1:2" is a substring of the genuine
    "Genesis 1:23" marker's reference, so this wrongly returns PASS.
    Genesis 1:2 carries no marker at all.
    """
    result = _verify("פ at Gen 1:2")
    assert result["status"] != "PASS", result


def test_gen1_11_not_pass():
    """Genesis 1:11 carries no petuchah marker."""
    result = _verify("פ at Gen 1:11")
    assert result["status"] != "PASS", result


def test_gen1_12_not_pass():
    """Genesis 1:12 carries no petuchah marker."""
    result = _verify("פ at Gen 1:12")
    assert result["status"] != "PASS", result


# --- AC-4 Ruth (regression fence; #118 already cleaned the 38 false positives) ---

def test_ruth4_17_passes():
    """Ruth 4:17 carries the sole genuine petuchah verse_end marker -> PASS."""
    result = _verify("פ at Ruth 4:17")
    assert result["status"] == "PASS", result


def test_ruth1_1_not_pass():
    """Ruth 1:1 was one of the 38 former false-positive markers."""
    result = _verify("פ at Ruth 1:1")
    assert result["status"] != "PASS", result


def test_ruth2_1_not_pass():
    """Ruth 2:1 was one of the 38 former false-positive markers."""
    result = _verify("פ at Ruth 2:1")
    assert result["status"] != "PASS", result


# --- Position gate (second genuine RED: within_verse must not certify a boundary claim) ---

def test_deut2_8_not_pass():
    """
    Second genuine RED: Deuteronomy 2:8 carries a setumah marker with
    position == "within_verse" (an internal pisqa be-emtsa pasuq), not a
    verse-boundary marker, and there is no verse_end marker at 2:8. On
    unfixed code the position-blind match loop wrongly returns PASS.
    """
    result = _verify("ס at Deut 2:8")
    assert result["status"] != "PASS", result


# --- Positive setumah accept (proves the gate accepts setumah, not only petuchah) ---

def test_gen3_15_setumah_passes():
    """Genesis 3:15 carries a single setumah verse_end marker -> PASS."""
    result = _verify("ס at Gen 3:15")
    assert result["status"] == "PASS", result


# --- Wrong-type contradiction ---

def test_gen1_5_wrong_type_not_pass():
    """Genesis 1:5 is a petuchah verse_end marker; a setumah claim there contradicts the data."""
    result = _verify("ס at Gen 1:5")
    assert result["status"] != "PASS", result


# --- UNVERIFIABLE preserved when the marker layer is absent ---

def test_marker_layer_absent_unverifiable():
    """Psalms has no Masoretic marker-layer data -> UNVERIFIABLE, never PASS."""
    result = _verify("ס at Psalms 1:1")
    assert result["status"] == "UNVERIFIABLE", result
    assert result["status"] != "PASS", result


# --- Corpus-wide position guard ---

def test_all_schema_v2_markers_have_position():
    """
    Every marker in every schema_version==2 reference/masoretic/*.json must
    populate `position` — the verse_end gate silently degrades to
    "always FAIL" for any marker missing it.
    """
    assert MASORETIC_DIR.is_dir(), f"Masoretic reference dir not found: {MASORETIC_DIR}"
    checked_files = 0
    checked_markers = 0
    for path in sorted(MASORETIC_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("schema_version") != 2:
            continue
        checked_files += 1
        for marker in data.get("markers", data.get("paragraph_breaks", [])):
            checked_markers += 1
            assert marker.get("position") is not None, (
                f"{path.name}: marker {marker!r} missing position"
            )
    assert checked_files > 0, "No schema_version==2 files found under reference/masoretic/"
    assert checked_markers > 0, "No markers found across schema_version==2 files"
