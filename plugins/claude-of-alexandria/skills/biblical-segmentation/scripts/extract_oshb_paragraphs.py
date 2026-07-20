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
import re
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


# ─── Validation (C3) ─────────────────────────────────────────────────────────

# Books that genuinely carry zero x-pe/x-samekh markers, keyed by OSIS
# abbreviation.
#
# KEYED BY OSIS CODE, NOT ENGLISH NAME — this is load-bearing. Every book in
# this module is identified by its OT_BOOKS *value* ("Ps", "Obad"), never its
# key ("Psalms", "Obadiah"). An English-named allowlist would never match, so
# both books would hard-fail exactly as if no allowlist existed, and the
# failure would present as a data problem rather than a spelling one.
#
# Psalms carries no marker layer for a STRUCTURAL reason, not a genre one:
# it is the one book whose canonical chapter division *is* the manuscript
# paragraph division, so the scribal marker layer is unused — its 150
# <chapter osisID="Ps.N"> elements are themselves the division mechanism.
# The genre argument ("poetry is not paragraph-divided prose") is false and
# must not be used: Job, Proverbs, Song and Lamentations are all poetry and
# all carry markers. Lamentations carries 89.
ZERO_MARKER_ALLOWLIST = {"Ps", "Obad"}

# Corpus-total sanity band. Observed: 3,162 markers over 23,213 verses.
CORPUS_TOTAL_MIN = 1500
CORPUS_TOTAL_MAX = 4000

# Stalled-cursor net: a book with at least this many markers, ALL collapsed to
# one anchor, is degenerate. Loose on purpose — Ruth legitimately carries a
# single marker, so the check must not fire on sparse books. Secondary net
# only; per-seg-type parity is the primary oracle.
STALLED_CURSOR_MIN_MARKERS = 5

# Deliberately absent: any density threshold. The 0.15/0.02 band was RETIRED,
# not re-tuned. Genuine per-book densities span 0.0 (Ps, Obad) to 0.578
# (Lamentations, 89 markers / 154 verses), so genuine Lamentations sits inside
# the range issue #118 called diagnostic of corruption and NO threshold
# separates genuine from corrupt. Density is reported as an observable only.
# Per-seg-type parity is the strong oracle and catches the classes the density
# heuristic reached for, exactly rather than statistically.

_RAW_SEG_TYPE_RE = re.compile(rb'<seg\b[^>]*\btype="(x-[a-z-]+)"')


def count_seg_types(xml_path: Path) -> dict:
    """Count <seg> elements by @type via the PARSED tree (ElementTree).

    This is the *parse-side* count. It shares the namespace-qualified walk with
    extract_markers, which is exactly why it is the correct input to the
    anti-vacuity arm: if the parse breaks, this goes to zero and the arm fires.
    Do NOT substitute the raw counter here — a raw count would survive a
    broken parse and make the arm vacuous.
    """
    counts: dict = {}
    root = ET.parse(xml_path).getroot()
    for elem in root.iter():
        if _local_tag(elem) == "seg":
            seg_type = elem.get("type")
            if seg_type:
                counts[seg_type] = counts.get(seg_type, 0) + 1
    return counts


def count_marker_segs_raw(xml_path: Path) -> dict:
    """Count marker <seg> elements by regex over RAW BYTES.

    Deliberately INDEPENDENT of ElementTree: it never parses, so it does not
    share the namespace handling that extract_markers depends on. That
    independence is the whole point. If the source-side count for parity came
    from the same walk that produced the output, a namespace regression would
    zero BOTH sides and parity would pass vacuously — reintroducing the
    original bug at the precise spot claimed to close it.
    """
    data = xml_path.read_bytes()
    counts = {"x-pe": 0, "x-samekh": 0}
    for match in _RAW_SEG_TYPE_RE.finditer(data):
        seg_type = match.group(1).decode("ascii")
        if seg_type in counts:
            counts[seg_type] += 1
    return counts


def validate_book(
    book: str,
    petuchot: list,
    setumot: list,
    verse_ids: set,
    seg_type_counts: dict,
) -> None:
    """Contradiction and absence tier. Raises naming the book.

    `book` is an OSIS code. `seg_type_counts` must come from count_seg_types
    (the parse-side path) — see the anti-vacuity arm below.
    """
    # Double-typing: WARN, never raise.
    #
    # The design called a verse carrying both a petuchah and a setumah
    # "structurally impossible". The corpus refutes that: three genuine cases
    # carry an x-samekh AND an x-pe as direct children of one <verse> —
    # 2Sam 16:13, 2Chr 5:1, Jer 38:28. A hard-fail rejects correct upstream
    # data, so this is a reported observable. (The pre-rebuild committed
    # corpus also carries 4,102 double-typed verses, so the shape is already
    # familiar to every downstream consumer.)
    both = set(petuchot) & set(setumot)
    if both:
        print(
            f"NOTE: book {book!r}: {len(both)} verse(s) carry both a petuchah "
            f"and a setumah: {sorted(both)[:5]}. Genuine in OSHB (3 corpus "
            f"cases); reported, not an error.",
            file=sys.stderr,
        )

    for anchor in list(petuchot) + list(setumot):
        if anchor not in verse_ids:
            raise ValueError(
                f"book {book!r}: marker anchored at {anchor!r}, which is not a "
                f"verse in this book's own <verse osisID> inventory"
            )

    if petuchot or setumot:
        return

    # Zero markers from here down.
    if book not in ZERO_MARKER_ALLOWLIST:
        raise ValueError(
            f"book {book!r}: zero paragraph markers. Only {sorted(ZERO_MARKER_ALLOWLIST)} "
            f"legitimately carry none; for any other book this indicates a parse failure"
        )

    # ANTI-VACUITY ARM. An allowlisted book is exempt from the zero-marker
    # floor ONLY on positive evidence that the parse actually worked. Without
    # this, the allowlist is a channel through which a Psalms-scoped parse
    # failure passes silently — the "validator vacuously satisfied by empty
    # output" class this design exists to prevent.
    #
    # The exemption must mean "parsed thousands of segs, none were markers",
    # never "found nothing, fine". Psalms has 5,461 non-marker segs; Obadiah 65.
    non_marker_segs = sum(
        n for t, n in seg_type_counts.items() if t not in MARKER_SEG_TYPES
    )
    if non_marker_segs == 0:
        raise ValueError(
            f"book {book!r} is zero-marker allowlisted, but the parse found no "
            f"<seg> elements of ANY type. That is an empty parse, not a "
            f"legitimate absence of markers: {book!r} should still carry "
            f"maqqef/sof-pasuq/paseq segs (Ps 5461, Obad 65). Refusing to "
            f"treat an empty parse as a validated zero."
        )


def validate_parity(
    book: str, petuchot: list, setumot: list, raw_counts: dict
) -> None:
    """Per-seg-type parity against the INDEPENDENT raw source count.

    The primary oracle. Catches localized type conflation (total right, split
    wrong) which every corpus-wide floor passes, and catches a namespace
    regression (output zero, source non-zero) which a shared-walk count could
    not.
    """
    for arr, seg_type, label in (
        (petuchot, "x-pe", "petuchot"),
        (setumot, "x-samekh", "setumot"),
    ):
        expected = raw_counts.get(seg_type, 0)
        if len(arr) != expected:
            raise ValueError(
                f"book {book!r}: per-type parity failure for {seg_type} — "
                f"source has {expected} element(s), output {label} has "
                f"{len(arr)}. A correct total does not make correct content."
            )


def validate_degeneracy(
    book: str, petuchot: list, setumot: list, chapter_count: int
) -> None:
    """Degeneracy tier: anchor distinctness and the distribution floor.

    The allowlist short-circuits this ENTIRE tier, not merely the zero-marker
    check. The distribution floor ("markers must span more than one chapter in
    a multi-chapter book") is trivially violated by zero markers, since zero
    markers span zero chapters — so without this short-circuit, Psalms would
    clear the zero-marker floor and then hard-fail here instead, for a reason
    nothing in the design or plan documents.
    """
    if book in ZERO_MARKER_ALLOWLIST:
        return

    anchors = list(petuchot) + list(setumot)

    # Stalled-cursor detection.
    #
    # This REPLACES a naive "any repeated anchor within an array" check, which
    # the corpus refuted: 29 genuine repeats across 7 books (Neh 3:2/3:23/3:29
    # in the wall-builders list, Ezra 3:1, Deut 5:21, 1Chr, 2Chr, 2Sam, Ezek),
    # each two x-samekh elements under one <verse>. In a list passage,
    # multiple section breaks inside one verse is the expected shape.
    #
    # What that check was reaching for is a stalled verse cursor, which emits
    # the correct COUNT with every anchor collapsed to a single value. Parity
    # is blind to it (the count is right), so this net is load-bearing —
    # stated precisely instead of by proxy.
    #
    # The threshold is a heuristic and is deliberately loose: a book may
    # legitimately carry very few markers (Ruth carries one), so only a book
    # with several markers ALL on one verse is implausible as a manuscript
    # shape. This is a secondary net; per-seg-type parity is the primary
    # oracle, and this one is tuned to avoid false positives rather than to
    # catch every case.
    if len(anchors) >= STALLED_CURSOR_MIN_MARKERS and len(set(anchors)) == 1:
        raise ValueError(
            f"book {book!r}: all {len(anchors)} markers collapse to the single "
            f"anchor {anchors[0]!r}. A stalled verse cursor produces exactly "
            f"this, and per-type parity cannot see it because the count is correct."
        )

    # DELIBERATELY ABSENT: the multi-chapter distribution floor ("markers must
    # span more than one chapter in a multi-chapter book"). It was DROPPED, not
    # re-tuned, because the corpus refuted it outright: it hard-fails Ruth,
    # whose single petuchah at 4:17 in a 4-chapter book is AC-2 GROUND TRUTH.
    # A check whose only corpus effect is a false positive on the best-verified
    # book in the dataset is not a check. Per-seg-type parity against the
    # independent raw count already covers the corruption class it reached for.


def validate_corpus(total_markers: int) -> None:
    """Corpus-wide sanity band. Observed: 3,162."""
    if not CORPUS_TOTAL_MIN <= total_markers <= CORPUS_TOTAL_MAX:
        raise ValueError(
            f"corpus total {total_markers} outside the sanity band "
            f"[{CORPUS_TOTAL_MIN}, {CORPUS_TOTAL_MAX}]. Do NOT widen this band "
            f"to get past the failure — it is calibrated against a real 39-book "
            f"census (observed 3162), so a miss means the data or the "
            f"extraction changed."
        )


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
