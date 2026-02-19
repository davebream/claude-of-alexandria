#!/usr/bin/env python3
"""
Parity test: compare Python script output vs SQLite database counts.
"""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent.parent.parent.parent / 'skills' / 'biblical-segmentation' / 'scripts'
DB_PATH = Path(__file__).parent.parent / 'data' / 'biblical.sqlite'

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'

passed = 0
failed = 0


def check(label: str, expected, actual):
    global passed, failed
    if expected == actual:
        print(f'  {PASS}  {label}: {actual}')
        passed += 1
    else:
        print(f'  {FAIL}  {label}: expected={expected}, actual={actual}')
        failed += 1


def py_discourse(book: str):
    result = subprocess.run(
        [sys.executable, 'levinsohn_parser.py', book, '--output', 'json'],
        capture_output=True, text=True, cwd=SCRIPTS_DIR
    )
    if result.returncode != 0:
        print(f'  ERROR running levinsohn_parser.py for {book}: {result.stderr[:200]}')
        return None
    return json.loads(result.stdout)


def db_discourse(book_canonical: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT feature, COUNT(*) as cnt FROM discourse_features WHERE book = ? GROUP BY feature',
        (book_canonical,)
    ).fetchall()
    conn.close()
    return {r['feature']: r['cnt'] for r in rows}


def py_paragraphs(book: str):
    result = subprocess.run(
        [sys.executable, 'sefaria_paragraphs.py', book, '--output', 'json'],
        capture_output=True, text=True, cwd=SCRIPTS_DIR
    )
    if result.returncode != 0:
        print(f'  ERROR running sefaria_paragraphs.py for {book}: {result.stderr[:200]}')
        return None
    data = json.loads(result.stdout)
    # Python returns a list of marker dicts
    if isinstance(data, list):
        petuchot = sum(1 for m in data if m.get('type') == 'petuchah')
        setumot = sum(1 for m in data if m.get('type') == 'setumah')
        return {'petuchot': petuchot, 'setumot': setumot, 'total': len(data)}
    return data


def db_paragraphs(book_canonical: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT marker_type, COUNT(*) as cnt FROM paragraph_markers WHERE book = ? GROUP BY marker_type',
        (book_canonical,)
    ).fetchall()
    conn.close()
    counts = {r['marker_type']: r['cnt'] for r in rows}
    petuchot = counts.get('petuchah', 0)
    setumot = counts.get('setumah', 0)
    return {'petuchot': petuchot, 'setumot': setumot, 'total': petuchot + setumot}


def db_vocabulary(book_canonical: str, testament: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        'SELECT COUNT(DISTINCT lemma) as cnt FROM vocabulary WHERE book = ? AND testament = ?',
        (book_canonical, testament)
    ).fetchone()
    conn.close()
    return row['cnt'] if row else 0


print('=' * 60)
print('PARITY TEST: Python scripts vs SQLite database')
print('=' * 60)

# ── Discourse Features ────────────────────────────────────────
print('\n[Discourse Features]')

DISCOURSE_BOOKS = [
    ('Mark', 'mark'),
    ('Philippians', 'philippians'),
    ('John', 'john'),
    ('Romans', 'romans'),
]

SEGMENTATION_FEATURES = [
    'historical_present', 'left_dislocation', 'referential_pod',
    'situational_pod', 'reported_speech', 'tail_head_linkage',
]

for book_name, book_canonical in DISCOURSE_BOOKS:
    py = py_discourse(book_name)
    if py is None:
        continue
    db = db_discourse(book_canonical)

    py_summary = py.get('summary', {})
    py_total = sum(py_summary.get(f, 0) for f in SEGMENTATION_FEATURES)
    db_total = sum(db.get(f, 0) for f in SEGMENTATION_FEATURES)
    check(f'{book_name} total (6 features)', py_total, db_total)

    # Per-feature checks for books with discrepancies
    if py_total != db_total:
        for feat in SEGMENTATION_FEATURES:
            py_cnt = py_summary.get(feat, 0)
            db_cnt = db.get(feat, 0)
            if py_cnt != db_cnt:
                check(f'  {book_name}.{feat}', py_cnt, db_cnt)

# ── Paragraph Markers ─────────────────────────────────────────
print('\n[Paragraph Markers]')

PARA_BOOKS = [
    ('genesis', 'genesis'),
    ('deuteronomy', 'deuteronomy'),
    ('psalms', 'psalms'),
]

for book_name, book_canonical in PARA_BOOKS:
    py = py_paragraphs(book_name)
    if py is None:
        continue
    db = db_paragraphs(book_canonical)
    check(f'{book_name} petuchot', py['petuchot'], db['petuchot'])
    check(f'{book_name} setumot', py['setumot'], db['setumot'])
    check(f'{book_name} total', py['total'], db['total'])

# ── Vocabulary (lemma counts) ─────────────────────────────────
print('\n[Vocabulary — distinct lemmas]')
# Quick sanity check: NT Mark should have a reasonable number of lemmas
mark_lemmas = db_vocabulary('mark', 'nt')
check('Mark NT lemmas > 400', True, mark_lemmas > 400)
check('Mark NT lemmas < 2000', True, mark_lemmas < 2000)
print(f'  (actual: {mark_lemmas})')

gen_lemmas = db_vocabulary('genesis', 'ot')
check('Genesis OT lemmas > 500', True, gen_lemmas > 500)
print(f'  (actual: {gen_lemmas})')

# ── Summary ───────────────────────────────────────────────────
print(f'\n{"=" * 60}')
total = passed + failed
print(f'Results: {passed} passed, {failed} failed / {total} total')
if failed > 0:
    sys.exit(1)
