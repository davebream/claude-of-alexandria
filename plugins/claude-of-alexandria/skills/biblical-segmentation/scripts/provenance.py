#!/usr/bin/env python3
"""
Pinned-source provenance for the biblical-segmentation extractors.

The committed morphology, vocabulary, and discourse-feature extractors read
their upstream corpora from MorphGNT/SBLGNT (Greek NT), OpenScriptures/morphhb
(Hebrew OT), and biblicalhumanities/levinsohn (Greek NT discourse features).
Without a pinned commit, a re-extraction could silently diverge from what is
committed with no way to tell why. This module pins each source to an exact
upstream commit and verifies the SHA-256 of every downloaded input file against
a committed checksum lockfile, so re-extraction is reproducible and
tamper-evident.

The pattern mirrors server/scripts/extract-macula-hebrew.py (COMMIT_SHA constant
+ hash verification) and the sibling extract_oshb_paragraphs.py, which already
pins the same morphhb commit for a different purpose. Because the OT extractors
read the very same morphhb WLC files as that script, they reuse its committed
lockfile, oshb-checksums.json — one source of truth for the WLC file hashes.

Usage from an extractor's main():

    import provenance
    root = (
        local_path
        if local_path.exists()
        else provenance.ensure_source_root("morphhb", book_codes)
    )
    # then read root / "wlc" / f"{code}.xml"  (morphhb)
    #   or  root / f"{code}.txt"              (sblgnt)

A caller-supplied local clone (--morphhb-path / --morphgnt-path) is honoured
as-is for offline/dev work; checksum verification applies to the pinned
*download* path, which is the reproducible default when no local clone exists.

Regenerate a lockfile after a DELIBERATE commit bump (same commit as the bump):

    python3 provenance.py --write-checksums sblgnt
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional

# ─── Version pinning ─────────────────────────────────────────────────────────
# Bump ONLY deliberately, and regenerate the matching lockfile in the same
# commit. MORPHHB_COMMIT_SHA must match the commit extract_oshb_paragraphs.py
# pins (both consume the same WLC files via oshb-checksums.json) — keep in sync.
MORPHHB_COMMIT_SHA = "3d15126fb1ef74867fc1434be1942e837932691f"
SBLGNT_COMMIT_SHA = "aaed91e57c8e4a8dc9a2383e129ca5e75fe6393d"
LEVINSOHN_COMMIT_SHA = "badd3a1043aebfa9907d0515069a4be1dd6eeb7a"

SOURCES: Dict[str, Dict[str, str]] = {
    "morphhb": {
        "commit": MORPHHB_COMMIT_SHA,
        "raw_base": "https://raw.githubusercontent.com/openscriptures/morphhb",
        "path_template": "wlc/{code}.xml",
        "checksums": "oshb-checksums.json",
    },
    "sblgnt": {
        "commit": SBLGNT_COMMIT_SHA,
        "raw_base": "https://raw.githubusercontent.com/morphgnt/sblgnt",
        "path_template": "{code}.txt",
        "checksums": "sblgnt-checksums.json",
    },
    "levinsohn": {
        "commit": LEVINSOHN_COMMIT_SHA,
        "raw_base": "https://raw.githubusercontent.com/biblicalhumanities/levinsohn",
        "path_template": "LGNTDF/{code}.xml",
        "checksums": "levinsohn-checksums.json",
    },
}

# Network settings — urllib has no default timeout, so a stall would hang CI
# indefinitely without this.
FETCH_TIMEOUT_SECONDS = 30
FETCH_MAX_ATTEMPTS = 3


def _here() -> Path:
    return Path(__file__).resolve().parent


def _source_cfg(source: str) -> Dict[str, str]:
    if source not in SOURCES:
        raise ValueError(f"unknown source {source!r}; known: {sorted(SOURCES)}")
    return SOURCES[source]


def checksums_path(source: str) -> Path:
    """The committed lockfile path, a fixed sibling of this module."""
    return _here() / _source_cfg(source)["checksums"]


def file_url(source: str, code: str) -> str:
    """Pinned raw.githubusercontent.com URL for a book code.

    The URL derives only from the hardcoded source config and the caller's
    book-code map — never from parsed file content — so it cannot be steered
    into a path-traversal or off-pin fetch.
    """
    cfg = _source_cfg(source)
    rel = cfg["path_template"].format(code=code)
    return f"{cfg['raw_base']}/{cfg['commit']}/{rel}"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(path: Path, expected: str) -> None:
    """Raise if path's SHA-256 does not match expected (lowercase hex)."""
    actual = sha256_of(path)
    if actual != expected:
        raise ValueError(
            f"checksum mismatch for {path.name}: expected {expected}, got {actual}"
        )


def load_checksums(source: str) -> Dict[str, str]:
    """Load a committed checksum lockfile.

    A missing lockfile is a hard failure that names --write-checksums rather
    than silently bootstrapping one — only --write-checksums may write it.
    """
    path = checksums_path(source)
    if not path.exists():
        raise RuntimeError(
            f"checksum lockfile not found at {path}. "
            f"Run: python3 provenance.py --write-checksums {source}"
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def repo_root() -> Path:
    """Walk up from this file to the directory containing `.git`.

    Never derived from os.getcwd() — the cache must land in the same place
    regardless of invocation directory. In a git worktree `.git` is a FILE,
    so this checks for existence, not directory-ness.
    """
    current = _here()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    raise RuntimeError(
        f"could not locate repo root (no .git found walking up from {current})"
    )


def cache_root(source: str) -> Path:
    """Download cache root for a source (under the gitignored .cache/)."""
    return repo_root() / ".cache" / source


def fetch_file(source: str, code: str, dest: Path, force: bool = False) -> Path:
    """Fetch one book file from the pinned commit into dest, reusing a cache hit.

    Up to FETCH_MAX_ATTEMPTS attempts with exponential backoff; exhaustion
    raises naming the book. TLS verification stays on via urlopen's default SSL
    context. Pass force=True to bypass a cache hit (used by the re-download-once
    recovery in fetch_and_verify).
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        return dest

    url = file_url(source, code)
    last_error: Optional[Exception] = None
    for attempt in range(FETCH_MAX_ATTEMPTS):
        try:
            with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as resp:
                data = resp.read()
            tmp = dest.with_suffix(dest.suffix + ".tmp")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001 - retried below, re-raised on exhaustion
            last_error = exc
            if attempt < FETCH_MAX_ATTEMPTS - 1:
                time.sleep(2**attempt)
    raise RuntimeError(
        f"failed to fetch {source} {code!r} after {FETCH_MAX_ATTEMPTS} attempts: "
        f"{last_error}"
    )


def fetch_and_verify(
    source: str, code: str, dest: Path, checksums: Dict[str, str]
) -> Path:
    """Fetch (or reuse the cache for) a book, then verify its checksum.

    Verification runs on every call, including cache hits — this catches local
    cache corruption, which the SHA pin alone cannot. On a cache-hit mismatch
    the file is re-downloaded exactly once; a persistent mismatch raises,
    naming the book. A book code absent from the lockfile is a hard failure.
    """
    if code not in checksums:
        raise RuntimeError(
            f"no checksum entry for {code!r} in {_source_cfg(source)['checksums']}. "
            f"Run: python3 provenance.py --write-checksums {source}"
        )
    expected = checksums[code]

    path = fetch_file(source, code, dest)
    try:
        verify_checksum(path, expected)
    except ValueError:
        print(
            f"WARNING: checksum mismatch for {code}, re-downloading once...",
            file=sys.stderr,
        )
        path = fetch_file(source, code, dest, force=True)
        try:
            verify_checksum(path, expected)
        except ValueError as exc:
            raise RuntimeError(
                f"checksum verification failed for {source} {code!r} even after "
                f"re-download: {exc}"
            ) from exc
    return path


def ensure_source_root(
    source: str, codes: Iterable[str], cache_dir: Optional[Path] = None
) -> Path:
    """Download + verify every needed book file and return the root the
    extractor should read from.

    The cache mirrors the source's in-repo layout, so an extractor that reads
    ``root / "wlc" / f"{code}.xml"`` (morphhb) or ``root / f"{code}.txt"``
    (sblgnt) works unchanged whether root is a caller-supplied clone or this
    verified cache.
    """
    cfg = _source_cfg(source)
    checksums = load_checksums(source)
    root = cache_dir or cache_root(source)
    for code in codes:
        rel = cfg["path_template"].format(code=code)
        fetch_and_verify(source, code, root / rel, checksums)
    return root


def _codes_for(source: str) -> List[str]:
    """Book codes for a source, imported lazily from the extractor maps so the
    lockfiles stay derived from a single canonical book list."""
    if source == "morphhb":
        from extract_ot_vocabulary import OT_BOOKS

        return list(OT_BOOKS.values())
    if source == "sblgnt":
        from extract_nt_vocabulary import NT_BOOKS

        return list(NT_BOOKS.values())
    if source == "levinsohn":
        from extract_levinsohn_discourse import XML_STEMS

        return list(XML_STEMS)
    raise ValueError(f"unknown source {source!r}")


def _write_checksums(source: str) -> None:
    cfg = _source_cfg(source)
    root = cache_root(source)
    checksums: Dict[str, str] = {}
    for code in _codes_for(source):
        rel = cfg["path_template"].format(code=code)
        dest = root / rel
        print(f"Fetching {source} {code} for lockfile...", file=sys.stderr)
        fetch_file(source, code, dest, force=True)
        checksums[code] = sha256_of(dest)
    out = checksums_path(source)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(checksums, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"Wrote {len(checksums)} entries to {out}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-checksums",
        choices=sorted(SOURCES),
        help="Regenerate the checksum lockfile for a source from its pinned commit.",
    )
    args = parser.parse_args()
    if args.write_checksums:
        _write_checksums(args.write_checksums)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
