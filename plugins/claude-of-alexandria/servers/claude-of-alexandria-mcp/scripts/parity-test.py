#!/usr/bin/env python3
"""
Parity test: compare tool outputs from local SQLite vs remote MCP endpoint.

Usage:
  python3 parity-test.py                    # Test local SQLite (original behaviour)
  python3 parity-test.py --url <workers_url>  # Test remote MCP endpoint
"""

import argparse
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

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


# ── MCP HTTP Client ───────────────────────────────────────────────────────────

class MCPClient:
    """Minimal MCP HTTP client for parity testing."""

    def __init__(self, base_url: str):
        if not HAS_REQUESTS:
            print('ERROR: requests library not installed. Run: pip3 install requests')
            sys.exit(1)
        self.base_url = base_url.rstrip('/')
        self._session_id: str | None = None
        self._req_id = 0
        self._initialize()

    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    def _post(self, body: dict) -> dict:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Mcp-Protocol-Version': '2024-11-05',
        }
        if self._session_id:
            headers['Mcp-Session-Id'] = self._session_id

        resp = requests.post(f'{self.base_url}/mcp', json=body, headers=headers, timeout=30)

        # Handle SSE stream response
        # Force UTF-8 decode — requests defaults to ISO-8859-1 for text/* without charset,
        # which corrupts Greek/Hebrew text and causes splitlines() to split on multibyte sequences.
        content_type = resp.headers.get('Content-Type', '')
        if 'text/event-stream' in content_type:
            # Parse first data: line from SSE stream
            body_text = resp.content.decode('utf-8')
            for line in body_text.splitlines():
                if line.startswith('data: '):
                    return json.loads(line[6:])
            raise ValueError(f'No data line in SSE response: {body_text[:200]}')

        return resp.json()

    def _initialize(self):
        body = {
            'jsonrpc': '2.0',
            'id': self._next_id(),
            'method': 'initialize',
            'params': {
                'protocolVersion': '2024-11-05',
                'capabilities': {},
                'clientInfo': {'name': 'parity-test', 'version': '1.0.0'},
            },
        }
        result = self._post(body)
        if 'error' in result:
            raise RuntimeError(f'MCP initialize failed: {result["error"]}')

    def call_tool(self, name: str, arguments: dict) -> dict:
        body = {
            'jsonrpc': '2.0',
            'id': self._next_id(),
            'method': 'tools/call',
            'params': {'name': name, 'arguments': arguments},
        }
        result = self._post(body)
        if 'error' in result:
            raise RuntimeError(f'MCP tool call failed: {result["error"]}')
        # Extract tool result text from MCP response
        content = result.get('result', {}).get('content', [])
        if not content:
            raise ValueError(f'Empty content in MCP response: {result}')
        return json.loads(content[0]['text'])


# ── Normalisation for cross-engine comparison ─────────────────────────────────

def normalize(obj):
    """Recursively normalize values for comparison.

    D1 may return integers where sql.js returns floats (or vice versa).
    Coerce all numbers to float for comparison.
    """
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize(v) for v in obj]
    if isinstance(obj, (int, float)):
        return float(obj)
    return obj


# ── Local DB helpers ──────────────────────────────────────────────────────────

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


def db_morphology_count(book_canonical: str, testament: str, range_str: str):
    """Count words returned by the morphology query for a given book/range."""
    # Parse range: "1:1-1:11"
    parts = range_str.split('-')
    if len(parts) == 1:
        sc, sv = map(int, parts[0].split(':'))
        ec, ev = sc, sv
    else:
        sc, sv = map(int, parts[0].split(':'))
        ec, ev = map(int, parts[1].split(':'))

    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        '''SELECT COUNT(*) as cnt FROM morphology
           WHERE book = ? AND testament = ?
           AND (chapter > ? OR (chapter = ? AND verse >= ?))
           AND (chapter < ? OR (chapter = ? AND verse <= ?))''',
        (book_canonical, testament, sc, sc, sv, ec, ec, ev)
    ).fetchone()
    conn.close()
    return row[0] if row else 0


# ── Remote MCP tests ──────────────────────────────────────────────────────────

SEGMENTATION_FEATURES = [
    'historical_present', 'left_dislocation', 'referential_pod',
    'situational_pod', 'reported_speech', 'tail_head_linkage',
]

DISCOURSE_BOOKS = [
    ('Mark', 'mark'),
    ('Philippians', 'philippians'),
    ('John', 'john'),
    ('Romans', 'romans'),
]

PARA_BOOKS = [
    ('genesis', 'genesis'),
    ('deuteronomy', 'deuteronomy'),
    ('psalms', 'psalms'),
]


def test_remote(client: MCPClient):
    print('\n[Remote MCP — Discourse Features]')
    for book_name, book_canonical in DISCOURSE_BOOKS:
        try:
            result = client.call_tool('query_discourse_features', {'book': book_name})
            summary = result.get('summary', {})
            remote_total = sum(summary.get(f, 0) for f in SEGMENTATION_FEATURES)
            db_counts = db_discourse(book_canonical)
            db_total = sum(db_counts.get(f, 0) for f in SEGMENTATION_FEATURES)
            check(f'{book_name} total (6 features)', db_total, remote_total)
        except Exception as e:
            print(f'  ERROR testing {book_name}: {e}')
            global failed
            failed += 1

    print('\n[Remote MCP — Paragraph Markers]')
    for book_name, book_canonical in PARA_BOOKS:
        try:
            result = client.call_tool('query_paragraph_breaks', {'book': book_name.title()})
            db = db_paragraphs(book_canonical)
            summary = result.get('summary', {})
            check(f'{book_name} petuchot', db['petuchot'], summary.get('petuchot', 0))
            check(f'{book_name} setumot', db['setumot'], summary.get('setumot', 0))
            check(f'{book_name} total', db['total'], summary.get('total', 0))
        except Exception as e:
            print(f'  ERROR testing {book_name}: {e}')
            failed += 1

    print('\n[Remote MCP — Vocabulary (distinct lemmas)]')
    try:
        result = client.call_tool('query_vocabulary', {'book': 'Mark'})
        remote_lemmas = result.get('total_lemmas', len(result.get('lemmas', [])))
        db_lemmas = db_vocabulary('mark', 'nt')
        check('Mark NT lemmas match', db_lemmas, remote_lemmas)
    except Exception as e:
        print(f'  ERROR testing vocabulary: {e}')
        failed += 1

    print('\n[Remote MCP — Morphology (word count)]')
    try:
        result = client.call_tool('query_morphology', {'book': 'John', 'range': '1:1-1:18'})
        remote_count = result.get('summary', {}).get('total_words', 0)
        db_count = db_morphology_count('john', 'nt', '1:1-1:18')
        check('John 1:1-1:18 word count', db_count, remote_count)
    except Exception as e:
        print(f'  ERROR testing morphology: {e}')
        failed += 1

    # OT morphology
    try:
        result = client.call_tool('query_morphology', {'book': 'Genesis', 'range': '1:1-1:5'})
        remote_count = result.get('summary', {}).get('total_words', 0)
        db_count = db_morphology_count('genesis', 'ot', '1:1-1:5')
        check('Genesis 1:1-1:5 word count', db_count, remote_count)
    except Exception as e:
        print(f'  ERROR testing OT morphology: {e}')
        failed += 1


# ── Local DB tests (original behaviour) ───────────────────────────────────────

def test_local():
    print('\n[Discourse Features — Python scripts vs SQLite]')
    for book_name, book_canonical in DISCOURSE_BOOKS:
        py = py_discourse(book_name)
        if py is None:
            continue
        db = db_discourse(book_canonical)
        py_summary = py.get('summary', {})
        py_total = sum(py_summary.get(f, 0) for f in SEGMENTATION_FEATURES)
        db_total = sum(db.get(f, 0) for f in SEGMENTATION_FEATURES)
        check(f'{book_name} total (6 features)', py_total, db_total)
        if py_total != db_total:
            for feat in SEGMENTATION_FEATURES:
                py_cnt = py_summary.get(feat, 0)
                db_cnt = db.get(feat, 0)
                if py_cnt != db_cnt:
                    check(f'  {book_name}.{feat}', py_cnt, db_cnt)

    print('\n[Paragraph Markers — Python scripts vs SQLite]')
    for book_name, book_canonical in PARA_BOOKS:
        py_result = subprocess.run(
            [sys.executable, 'sefaria_paragraphs.py', book_name, '--output', 'json'],
            capture_output=True, text=True, cwd=SCRIPTS_DIR
        )
        if py_result.returncode != 0:
            print(f'  ERROR running sefaria_paragraphs.py for {book_name}')
            continue
        py = json.loads(py_result.stdout)
        if isinstance(py, list):
            petuchot = sum(1 for m in py if m.get('type') == 'petuchah')
            setumot = sum(1 for m in py if m.get('type') == 'setumah')
            py = {'petuchot': petuchot, 'setumot': setumot, 'total': len(py)}
        db = db_paragraphs(book_canonical)
        check(f'{book_name} petuchot', py['petuchot'], db['petuchot'])
        check(f'{book_name} setumot', py['setumot'], db['setumot'])
        check(f'{book_name} total', py['total'], db['total'])

    print('\n[Vocabulary — distinct lemmas]')
    mark_lemmas = db_vocabulary('mark', 'nt')
    check('Mark NT lemmas > 400', True, mark_lemmas > 400)
    check('Mark NT lemmas < 2000', True, mark_lemmas < 2000)
    print(f'  (actual: {mark_lemmas})')
    gen_lemmas = db_vocabulary('genesis', 'ot')
    check('Genesis OT lemmas > 500', True, gen_lemmas > 500)
    print(f'  (actual: {gen_lemmas})')


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Parity test: local SQLite vs remote MCP endpoint')
    parser.add_argument('--url', help='Remote Workers URL (e.g. https://claude-of-alexandria-mcp.<account>.workers.dev)')
    args = parser.parse_args()

    print('=' * 60)
    if args.url:
        print(f'PARITY TEST: Remote MCP endpoint vs local SQLite')
        print(f'URL: {args.url}')
    else:
        print('PARITY TEST: Python scripts vs SQLite database')
    print('=' * 60)

    if args.url:
        client = MCPClient(args.url)
        test_remote(client)
    else:
        test_local()

    print(f'\n{"=" * 60}')
    total = passed + failed
    print(f'Results: {passed} passed, {failed} failed / {total} total')
    if failed > 0:
        sys.exit(1)
