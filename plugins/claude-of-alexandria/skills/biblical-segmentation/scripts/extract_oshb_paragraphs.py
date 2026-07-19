#!/usr/bin/env python3
"""Masoretic paragraph marker extraction from OpenScriptures morphhb (OSHB).

Rebuilds the 39 committed `reference/masoretic/*.json` files from OSHB's
explicit XML markup (`<seg type="x-pe">` for petuchah, `<seg type="x-samekh">`
for setumah) at a pinned commit, rather than matching the Hebrew letters פ/ס
in running text — the letter-matching approach is the original bug: those
letters also appear inside ordinary words (e.g. פרי, נפש).

Usage:
    python3 extract_oshb_paragraphs.py --fetch-only
    python3 extract_oshb_paragraphs.py --write-checksums

Source:
    OpenScriptures Hebrew Bible (OSHB) / Westminster Leningrad Codex
    https://github.com/openscriptures/morphhb
"""

import argparse
import hashlib
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# ─── Version pinning ─────────────────────────────────────────────────────────
COMMIT_SHA = "3d15126fb1ef74867fc1434be1942e837932691f"

# ─── OT book order and OSIS file mapping ─────────────────────────────────────
# Copied verbatim from extract_ot_morphology.py:44-84.
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

# ─── OSIS namespace handling ─────────────────────────────────────────────────
# OSHB files declare xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace"
# on the root element, so ElementTree returns namespace-qualified tags. Copied
# verbatim from extract_ot_morphology.py:86 — an unqualified `elem.tag == 'seg'`
# match yields 0 elements on real OSHB XML (verified: 269 on wlc/Ruth.xml with
# the namespace-qualified form). This is the highest-risk detail in this
# module: the naive form fails silently and completely, with no exception and
# no partial result.
OSIS_NS = {'osis': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}

# The nine distinct @type values OSHB uses across the 39-book corpus, with
# their observed counts. This is a full census, not an inference from two
# books:
#
#   markers      x-pe 1181, x-samekh 1981
#   punctuation  x-maqqef 42577, x-sof-pasuq 23192, x-paseq 2278
#   layout       x-reversednun 9, x-large 4, x-suspended 4, x-small 3
#
# The four layout types were NOT in the original five-type allowlist. The
# design had flagged them as an open unknown — "whether OSHB renders any of
# them as <seg> variants is not established" — and said the hard-fail would
# convert that unknown into a signal. It did exactly that: a full-corpus run
# hard-failed on 9 of 39 books (Lev, Num, Deut, Judg, Job, Ps, Prov, Isa,
# Jer). They are scribal-layout annotations, not paragraph divisions, so they
# are recognized and ignored here, never emitted as markers.
#
# Anything outside these nine still hard-fails: an unknown type is a signal,
# never silently dropped.
KNOWN_SEG_TYPES = {
    "x-pe",
    "x-samekh",
    "x-maqqef",
    "x-sof-pasuq",
    "x-paseq",
    "x-reversednun",
    "x-large",
    "x-suspended",
    "x-small",
}
MARKER_SEG_TYPES = {"x-pe": "petuchah", "x-samekh": "setumah"}

RAW_BASE_URL = "https://raw.githubusercontent.com/openscriptures/morphhb"

# Network settings — urllib has no default timeout, so a stall would hang CI
# indefinitely without this.
FETCH_TIMEOUT_SECONDS = 30
FETCH_MAX_ATTEMPTS = 3

# The checksum lockfile lives beside this script. This is a fixed sibling
# path, not a provenance string stamped into output — the emitted JSONs never
# reference it.
CHECKSUMS_FILENAME = "oshb-checksums.json"


def checksums_path() -> Path:
    return Path(__file__).resolve().parent / CHECKSUMS_FILENAME


def verify_checksum(path: Path, expected: str) -> None:
    """Raise if path's SHA-256 does not match expected (lowercase hex)."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        raise ValueError(
            f"checksum mismatch for {path.name}: expected {expected}, got {actual}"
        )


def load_checksums(path: Path) -> dict:
    """Load the committed checksum lockfile.

    A missing lockfile is a hard failure that names --write-checksums rather
    than silently bootstrapping one — only --write-checksums may write it.
    """
    if not path.exists():
        raise RuntimeError(
            f"checksum lockfile not found at {path}. "
            "Run with --write-checksums to generate it."
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_checksums(path: Path, checksums: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(checksums, f, indent=2, sort_keys=True)
        f.write("\n")


def repo_root() -> Path:
    """Walk up from this file's location to the directory containing `.git`.

    Never derived from os.getcwd() — the cache must land in the same place
    regardless of invocation directory. In a git worktree `.git` is a FILE
    (it contains a `gitdir:` pointer to the real worktree metadata under the
    main checkout's `.git/worktrees/<name>/`), not a directory, so this walk
    checks for the *existence* of `.git` rather than requiring it to be a
    directory.
    """
    current = Path(__file__).resolve().parent
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    raise RuntimeError(
        f"could not locate repo root (no .git found walking up from {current})"
    )


def book_url(code: str) -> str:
    """Build the pinned raw.githubusercontent.com URL for an OSIS book code.

    Both the URL and the output filename derive only from the hardcoded
    OT_BOOKS map — never from parsed XML content. This is an invariant, not
    an incident: deriving a URL or output path from a parsed osisID would
    open a traversal vector.
    """
    return f"{RAW_BASE_URL}/{COMMIT_SHA}/wlc/{code}.xml"


def cache_dir_for(root: Path) -> Path:
    return root / ".cache" / "oshb"


def fetch_book(code: str, cache_dir: Path, force: bool = False) -> Path:
    """Fetch a single book's OSHB XML into cache_dir, reusing a cache hit.

    Up to FETCH_MAX_ATTEMPTS attempts with exponential backoff; exhaustion
    raises naming the book. TLS verification stays on by default via
    urlopen's default SSL context. Pass force=True to bypass a cache hit and
    re-download (used by fetch_and_verify's re-download-once recovery).
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{code}.xml"
    if dest.exists() and not force:
        return dest

    url = book_url(code)
    last_error: Exception | None = None
    for attempt in range(FETCH_MAX_ATTEMPTS):
        try:
            with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as resp:
                data = resp.read()
            tmp = dest.with_suffix(".xml.tmp")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001 - retried below, re-raised on exhaustion
            last_error = exc
            if attempt < FETCH_MAX_ATTEMPTS - 1:
                import time

                time.sleep(2**attempt)
    raise RuntimeError(
        f"failed to fetch book {code!r} after {FETCH_MAX_ATTEMPTS} attempts: {last_error}"
    )


def fetch_and_verify(code: str, cache_dir: Path, checksums: dict) -> Path:
    """Fetch (or reuse the cache for) a book, then verify its checksum.

    Verification runs on every call, including cache hits — this catches
    local cache corruption, which the SHA pin alone cannot. If a cache-hit
    file fails verification, it is re-downloaded exactly once; if the fresh
    copy still fails, this raises naming the book.
    """
    if code not in checksums:
        raise RuntimeError(
            f"no checksum entry for book code {code!r} in {CHECKSUMS_FILENAME}. "
            "Run with --write-checksums to (re)generate it."
        )
    expected = checksums[code]

    path = fetch_book(code, cache_dir)
    try:
        verify_checksum(path, expected)
    except ValueError:
        print(
            f"WARNING: checksum mismatch for {code}, re-downloading once...",
            file=sys.stderr,
        )
        path = fetch_book(code, cache_dir, force=True)
        try:
            verify_checksum(path, expected)
        except ValueError as exc:
            raise RuntimeError(
                f"checksum verification failed for book {code!r} even after "
                f"re-download: {exc}"
            ) from exc
    return path


def _fetch_all(cache_dir: Path) -> None:
    for name, code in OT_BOOKS.items():
        print(f"Fetching {name} ({code})...", file=sys.stderr)
        fetch_book(code, cache_dir)


def _fetch_verify_all(cache_dir: Path, checksums: dict) -> None:
    for name, code in OT_BOOKS.items():
        print(f"Fetching and verifying {name} ({code})...", file=sys.stderr)
        fetch_and_verify(code, cache_dir, checksums)


def _write_checksums_for_all(cache_dir: Path) -> None:
    checksums: dict = {}
    for name, code in OT_BOOKS.items():
        print(f"Fetching {name} ({code}) for checksum lockfile...", file=sys.stderr)
        path = fetch_book(code, cache_dir)
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                digest.update(chunk)
        checksums[code] = digest.hexdigest()
    write_checksums(checksums_path(), checksums)
    print(f"Wrote {len(checksums)} entries to {checksums_path()}", file=sys.stderr)


def _local_tag(elem: ET.Element) -> str:
    """Strip the namespace URI wrapper ElementTree adds, e.g.
    '{http://www.bibletechnologies.net/2003/OSIS/namespace}seg' -> 'seg'."""
    tag = elem.tag
    return tag.split("}", 1)[1] if "}" in tag else tag


def parse_osis_id(osis_id: str) -> tuple[int, int]:
    """Parse an osisID into (chapter, verse).

    A space-separated span (e.g. "Ps.3.1 Ps.3.2") anchors to the FINAL verse
    of the span: under position:"after" semantics the break follows the whole
    span, so first-vs-last would be a silent off-by-one. Both C3 validators
    are blind to getting this wrong (either verse exists in the source, and
    count parity is unaffected), so this is the only gate on it.
    """
    parts = osis_id.strip().split()
    if not parts:
        raise ValueError(f"empty osisID")
    final = parts[-1]
    segments = final.split(".")
    if len(segments) < 3:
        raise ValueError(
            f"cannot parse osisID {osis_id!r}: expected Book.Chapter.Verse"
        )
    try:
        chapter = int(segments[-2])
        verse = int(segments[-1])
    except ValueError as exc:
        raise ValueError(f"cannot parse osisID {osis_id!r}: {exc}") from exc
    return chapter, verse


def extract_markers(xml_path: Path) -> tuple[list[str], list[str]]:
    """Walk an OSHB book XML in document order, emitting paragraph markers.

    Returns (petuchot, setumot) as document-ordered "C:V" strings, anchored
    to the most recently seen <verse osisID>. Arrays are document-order
    lists — never materialized from a set, since PYTHONHASHSEED randomizes
    list(set(...)) iteration order per process.

    Hard-fails (raises) on:
    - a marker element (x-pe/x-samekh) with no antecedent verse
    - an unrecognized <seg type=...> value

    Warns (stderr, does not raise) on unexpected marker placement — a marker
    that is not the last child of the verse it anchors to. This is n=1
    evidence in the real corpus (Ruth), so a hard-fail here would be a
    false-positive generator against correct upstream data.
    """
    book_label = xml_path.stem
    tree = ET.parse(xml_path)
    root = tree.getroot()

    petuchot: list[str] = []
    setumot: list[str] = []
    current_anchor: str | None = None
    current_verse_elem: ET.Element | None = None

    for elem in root.iter():
        tag = _local_tag(elem)
        if tag == "verse":
            osis_id = elem.get("osisID")
            if osis_id:
                chapter, verse = parse_osis_id(osis_id)
                current_anchor = f"{chapter}:{verse}"
                current_verse_elem = elem
        elif tag == "seg":
            seg_type = elem.get("type")
            if seg_type not in KNOWN_SEG_TYPES:
                raise ValueError(
                    f"unrecognized <seg type={seg_type!r}> in book {book_label!r}"
                )
            if seg_type in MARKER_SEG_TYPES:
                if current_anchor is None:
                    raise ValueError(
                        f"marker element ({seg_type}) with no antecedent verse "
                        f"in book {book_label!r}"
                    )
                # Placement check: expected shape is the marker as the last
                # child of the verse it anchors to. Anything else is
                # unexpected placement — warn only (n=1 evidence).
                if current_verse_elem is None or (
                    len(current_verse_elem) == 0
                    or current_verse_elem[-1] is not elem
                ):
                    print(
                        f"WARNING: unexpected placement for {seg_type} marker "
                        f"anchored at {current_anchor} in book {book_label!r}",
                        file=sys.stderr,
                    )
                if seg_type == "x-pe":
                    petuchot.append(current_anchor)
                else:
                    setumot.append(current_anchor)
    return petuchot, setumot


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract Masoretic paragraph markers from pinned OSHB XML."
    )
    parser.add_argument(
        "--fetch-only",
        action="store_true",
        help="Fetch and cache all 39 book XMLs, then exit without extracting.",
    )
    parser.add_argument(
        "--write-checksums",
        action="store_true",
        help="Regenerate the checksum lockfile from freshly fetched books. "
        "This is the only path that writes oshb-checksums.json.",
    )
    args = parser.parse_args()

    root = repo_root()
    cache_dir = cache_dir_for(root)

    if args.write_checksums:
        _write_checksums_for_all(cache_dir)
        return

    if args.fetch_only:
        _fetch_all(cache_dir)
        return

    checksums = load_checksums(checksums_path())
    _fetch_verify_all(cache_dir, checksums)
    # Later tasks (extraction, validation, emission) attach here.


if __name__ == "__main__":
    main()
