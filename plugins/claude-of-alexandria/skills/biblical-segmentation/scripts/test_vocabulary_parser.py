#!/usr/bin/env python3
"""
Test cases for vocabulary_parser.py

RED Phase: Run these tests BEFORE creating vocabulary_parser.py to verify they fail.
GREEN Phase: Create vocabulary_parser.py and verify these tests pass.

Usage:
    python test_vocabulary_parser.py
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
VOCAB_PARSER = SCRIPT_DIR / "vocabulary_parser.py"


def run_parser(*args) -> tuple[int, str, str]:
    """Run vocabulary_parser.py with args and return (returncode, stdout, stderr)."""
    cmd = [sys.executable, str(VOCAB_PARSER)] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def test_script_exists():
    """Test: vocabulary_parser.py exists."""
    assert VOCAB_PARSER.exists(), f"Script not found: {VOCAB_PARSER}"
    print("✓ Script exists")


def test_list_books_nt():
    """Test: --list-books returns NT books."""
    code, stdout, stderr = run_parser("--list-books")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "Philippians" in stdout, "Expected 'Philippians' in book list"
    assert "Romans" in stdout, "Expected 'Romans' in book list"
    print("✓ --list-books returns NT books")


def test_list_books_ot():
    """Test: --list-books --testament ot returns OT books."""
    code, stdout, stderr = run_parser("--list-books", "--testament", "ot")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "Genesis" in stdout, "Expected 'Genesis' in OT book list"
    print("✓ --list-books --testament ot returns OT books")


def test_list_themes():
    """Test: --list-themes shows predefined themes."""
    code, stdout, stderr = run_parser("--list-themes")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "joy" in stdout.lower(), "Expected 'joy' in themes"
    assert "covenant" in stdout.lower(), "Expected 'covenant' in themes"
    print("✓ --list-themes shows predefined themes")


def test_book_vocabulary_yaml():
    """Test: Book query returns YAML with vocabulary data."""
    code, stdout, stderr = run_parser("Philippians")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "book: Philippians" in stdout, "Expected 'book: Philippians' in output"
    assert "testament: nt" in stdout, "Expected 'testament: nt' in output"
    print("✓ Book query returns YAML vocabulary data")


def test_book_vocabulary_json():
    """Test: Book query with --output json returns valid JSON."""
    code, stdout, stderr = run_parser("Philippians", "--output", "json")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    data = json.loads(stdout)
    assert data["book"] == "Philippians", "Expected book to be Philippians"
    assert data["testament"] == "nt", "Expected testament to be nt"
    print("✓ Book query returns valid JSON")


def test_theme_search():
    """Test: --theme joy finds joy-related lemmas in Philippians."""
    code, stdout, stderr = run_parser("Philippians", "--theme", "joy")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "thematic_search" in stdout, "Expected thematic_search in output"
    assert "χαίρω" in stdout, "Expected χαίρω in output"
    print("✓ --theme joy finds joy lemmas")


def test_theme_search_with_counts():
    """Test: Joy theme search shows correct counts for Philippians."""
    code, stdout, stderr = run_parser("Philippians", "--theme", "joy", "--output", "json")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    data = json.loads(stdout)
    matches = data.get("thematic_search", {}).get("matches", [])

    # Find χαίρω in matches
    chairo = next((m for m in matches if m["lemma"] == "χαίρω"), None)
    assert chairo is not None, "Expected χαίρω in matches"
    assert chairo["total"] == 9, f"Expected χαίρω total=9, got {chairo['total']}"

    # Find χαρά in matches
    chara = next((m for m in matches if m["lemma"] == "χαρά"), None)
    assert chara is not None, "Expected χαρά in matches"
    assert chara["total"] == 5, f"Expected χαρά total=5, got {chara['total']}"
    print("✓ Joy theme shows correct Philippians counts (χαίρω=9, χαρά=5)")


def test_check_clustering():
    """Test: --check-clustering returns clustering info."""
    code, stdout, stderr = run_parser("Romans", "--check-clustering")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "clustering" in stdout, "Expected 'clustering' in output"
    assert "has_clustering" in stdout, "Expected 'has_clustering' in output"
    print("✓ --check-clustering returns clustering info")


def test_ot_book_query():
    """Test: OT book query with --testament ot."""
    code, stdout, stderr = run_parser("Genesis", "--testament", "ot")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "book: Genesis" in stdout, "Expected 'book: Genesis' in output"
    assert "testament: ot" in stdout, "Expected 'testament: ot' in output"
    print("✓ OT book query works with --testament ot")


def test_ot_covenant_theme():
    """Test: Covenant theme search in Genesis (OT)."""
    code, stdout, stderr = run_parser("Genesis", "--testament", "ot", "--theme", "covenant")
    assert code == 0, f"Expected exit code 0, got {code}: {stderr}"
    assert "thematic_search" in stdout, "Expected thematic_search in output"
    assert "H1285" in stdout, "Expected H1285 (covenant) in output"
    print("✓ OT covenant theme search finds H1285")


def test_invalid_book():
    """Test: Invalid book returns error."""
    code, stdout, stderr = run_parser("NotABook")
    assert code != 0, "Expected non-zero exit code for invalid book"
    assert "error" in (stdout + stderr).lower(), "Expected error message"
    print("✓ Invalid book returns error")


def test_case_insensitive_book():
    """Test: Book names are case-insensitive."""
    code1, stdout1, _ = run_parser("philippians", "--output", "json")
    code2, stdout2, _ = run_parser("PHILIPPIANS", "--output", "json")
    code3, stdout3, _ = run_parser("Philippians", "--output", "json")

    assert code1 == 0 and code2 == 0 and code3 == 0, "All case variants should work"

    data1 = json.loads(stdout1)
    data2 = json.loads(stdout2)
    data3 = json.loads(stdout3)

    assert data1["book"] == data2["book"] == data3["book"], "All should return same book"
    print("✓ Book names are case-insensitive")


def run_all_tests():
    """Run all tests and report results."""
    tests = [
        test_script_exists,
        test_list_books_nt,
        test_list_books_ot,
        test_list_themes,
        test_book_vocabulary_yaml,
        test_book_vocabulary_json,
        test_theme_search,
        test_theme_search_with_counts,
        test_check_clustering,
        test_ot_book_query,
        test_ot_covenant_theme,
        test_invalid_book,
        test_case_insensitive_book,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: Unexpected error: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
