#!/usr/bin/env python3
"""Extract committed JSON from pinned Levinsohn LGNTDF XML.

The default path downloads the exact upstream revision through ``provenance``
and verifies every XML file against ``levinsohn-checksums.json`` before parsing.
A local source directory is accepted for offline reproduction, but it is held to
the same committed checksums.

Usage:
    python3 extract_levinsohn_discourse.py
    python3 extract_levinsohn_discourse.py --source-dir /path/to/levinsohn
    python3 extract_levinsohn_discourse.py --output-dir /tmp/levinsohn-json
"""

import argparse
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import provenance

COMMIT_SHA = provenance.LEVINSOHN_COMMIT_SHA
EXPECTED_TOTAL_REFERENCES = 52_257

# This allowlist is intentionally independent of the upstream XInclude index.
# The pinned index must match it exactly; parsed input is never allowed to steer
# download URLs or output paths.
FEATURE_STEMS: Tuple[str, ...] = (
    "Ambiguous",
    "Annotations",
    "Appositive",
    "Articular_Pronoun",
    "Cataphoric_Focus",
    "Cataphoric_referent",
    "Constituent_Negation",
    "DFE",
    "EmbeddedRepSpeech",
    "Embedded_DFE",
    "Embedded_Focus+",
    "Focus+",
    "Futuristic_Present",
    "Highlighter",
    "Historical_Perfect",
    "Historical_Present",
    "Left-Dislocation",
    "Main_clauses",
    "Noun_Incorporation",
    "OT_quotes",
    "Over-encoding",
    "Postposed_them_subject",
    "Referential_PoD+",
    "Referential_PoD",
    "Reported_Speech",
    "Right-Dislocated",
    "Situational_PoD",
    "Specific_Circumstance",
    "Split_Focal",
    "Tail-Head_linkage",
    "Thematic_Prominence",
    "Topical_Genitive",
    "Verb_Focus+",
)
INDEX_STEM = "levinsohn"
XML_STEMS = FEATURE_STEMS + (INDEX_STEM,)
XINCLUDE_NS = "http://www.w3.org/2001/XInclude"
SAFE_XML_NAME = re.compile(r"^[A-Za-z0-9_+\-]+\.xml$")
WORD_INDEX_SUFFIX = re.compile(r"!(\d+)$")


@dataclass(frozen=True)
class ExtractedFeature:
    stem: str
    feature: str
    description: str
    references: List[Dict[str, object]]
    source_count: int


def _required_text(parent: ET.Element, path: str, stem: str) -> str:
    elem = parent.find(path)
    if elem is None or elem.text is None:
        raise ValueError(f"{stem}: missing required XML element {path!r}")
    return elem.text


def _required_attribute(elem: ET.Element, name: str, stem: str, ordinal: int) -> str:
    value = elem.get(name)
    if value is None:
        raise ValueError(f"{stem}: reference {ordinal} missing attribute {name!r}")
    return value


def parse_word_index(osis_ref: str, stem: str, ordinal: int) -> int:
    match = WORD_INDEX_SUFFIX.search(osis_ref)
    if not match:
        raise ValueError(
            f"{stem}: reference {ordinal} has invalid osisRef {osis_ref!r}; "
            "expected a terminal !N word index"
        )
    word_index = int(match.group(1))
    if word_index < 1:
        raise ValueError(
            f"{stem}: reference {ordinal} has non-positive osisRef word index "
            f"{word_index}"
        )
    return word_index


def parse_feature_xml(xml_path: Path, stem: str) -> ExtractedFeature:
    """Parse one feature XML without dropping or reordering references."""
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError) as exc:
        raise ValueError(f"{stem}: failed to parse {xml_path}: {exc}") from exc

    feature_name = _required_text(root, "./header/name", stem)
    description = _required_text(root, "./header/description", stem)
    references_parent = root.find("./references")
    if references_parent is None:
        raise ValueError(f"{stem}: missing required XML element './references'")

    source_refs = references_parent.findall("./reference")
    references: List[Dict[str, object]] = []
    for ordinal, ref in enumerate(source_refs, start=1):
        osis_ref = _required_attribute(ref, "osisRef", stem, ordinal)
        references.append(
            {
                "verse": _required_attribute(ref, "verse", stem, ordinal),
                "word_index": parse_word_index(osis_ref, stem, ordinal),
                # The historical JSON trims XML formatting whitespace while
                # preserving meaningful internal newlines in annotations.
                "word": (ref.text or "").strip(),
                "type": _required_attribute(ref, "type", stem, ordinal),
            }
        )

    feature = ExtractedFeature(
        stem=stem,
        feature=feature_name,
        description=description,
        references=references,
        source_count=len(source_refs),
    )
    validate_feature(feature)
    return feature


def parse_index_xml(xml_path: Path) -> Tuple[str, ...]:
    """Return the safe, ordered feature stems named by the XInclude index."""
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError) as exc:
        raise ValueError(f"levinsohn: failed to parse {xml_path}: {exc}") from exc

    stems: List[str] = []
    seen = set()
    for include in root.findall(f"./{{{XINCLUDE_NS}}}include"):
        href = include.get("href", "")
        if not SAFE_XML_NAME.fullmatch(href) or Path(href).name != href:
            raise ValueError(f"levinsohn: unsafe XInclude href {href!r}")
        stem = href[:-4]
        if stem in seen:
            raise ValueError(f"levinsohn: duplicate XInclude entry {href!r}")
        seen.add(stem)
        stems.append(stem)
    return tuple(stems)


def feature_payload(feature: ExtractedFeature) -> Dict[str, object]:
    return {
        "feature": feature.feature,
        "description": feature.description,
        "references": feature.references,
    }


def render_feature(feature: ExtractedFeature) -> str:
    return json.dumps(feature_payload(feature), indent=2, ensure_ascii=False)


def validate_feature(feature: ExtractedFeature) -> None:
    output_count = len(feature.references)
    if feature.source_count != output_count:
        raise ValueError(
            f"{feature.stem}: source count {feature.source_count} does not match "
            f"output count {output_count}"
        )

    # Count the serialized representation too. This keeps validation independent
    # of the in-memory list that the writer receives.
    serialized = json.loads(render_feature(feature))
    serialized_count = len(serialized.get("references", []))
    if feature.source_count != serialized_count:
        raise ValueError(
            f"{feature.stem}: source count {feature.source_count} does not match "
            f"serialized output count {serialized_count}"
        )


def validate_corpus(
    features: Sequence[ExtractedFeature],
    index_stems: Sequence[str],
    expected_stems: Sequence[str] = FEATURE_STEMS,
    expected_total: Optional[int] = EXPECTED_TOTAL_REFERENCES,
) -> None:
    actual_stems = tuple(feature.stem for feature in features)
    expected_stems_tuple = tuple(expected_stems)
    if actual_stems != expected_stems_tuple:
        raise ValueError(
            f"feature parse order mismatch: expected {expected_stems_tuple}, "
            f"got {actual_stems}"
        )
    if tuple(index_stems) != expected_stems_tuple:
        raise ValueError(
            f"levinsohn index mismatch: expected {expected_stems_tuple}, "
            f"got {tuple(index_stems)}"
        )

    for feature in features:
        validate_feature(feature)

    total = sum(feature.source_count for feature in features)
    if expected_total is not None and total != expected_total:
        raise ValueError(
            f"Levinsohn corpus count mismatch: expected {expected_total}, got {total}"
        )


def _atomic_write(dest: Path, text: str) -> None:
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(dest)


def validate_all_then_write_all(
    features: Sequence[ExtractedFeature],
    index_stems: Sequence[str],
    output_dir: Path,
    expected_stems: Sequence[str] = FEATURE_STEMS,
    expected_total: Optional[int] = EXPECTED_TOTAL_REFERENCES,
) -> None:
    """Validate the entire corpus before creating the output directory."""
    validate_corpus(features, index_stems, expected_stems, expected_total)

    output_dir.mkdir(parents=True, exist_ok=True)
    for feature in features:
        _atomic_write(output_dir / f"{feature.stem}.json", render_feature(feature))

    index_payload = {"feature": INDEX_STEM, "description": "", "references": []}
    _atomic_write(
        output_dir / f"{INDEX_STEM}.json",
        json.dumps(index_payload, indent=2, ensure_ascii=False),
    )


def verify_local_source(source_root: Path) -> None:
    checksums = provenance.load_checksums("levinsohn")
    for stem in XML_STEMS:
        path = source_root / "LGNTDF" / f"{stem}.xml"
        if not path.exists():
            raise ValueError(f"Levinsohn source file not found: {path}")
        if stem not in checksums:
            raise ValueError(f"no checksum entry for Levinsohn source {stem!r}")
        provenance.verify_checksum(path, checksums[stem])


def build_corpus(source_root: Path) -> Tuple[List[ExtractedFeature], Tuple[str, ...]]:
    source_dir = source_root / "LGNTDF"
    index_stems = parse_index_xml(source_dir / f"{INDEX_STEM}.xml")
    features = [
        parse_feature_xml(source_dir / f"{stem}.xml", stem) for stem in FEATURE_STEMS
    ]
    return features, index_stems


def default_output_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "reference" / "levinsohn"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Local pinned levinsohn checkout; all XML checksums are still verified.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir(),
        help="Destination for generated JSON (defaults to the committed reference directory).",
    )
    args = parser.parse_args()

    if args.source_dir is not None:
        source_root = args.source_dir.resolve()
        verify_local_source(source_root)
    else:
        print(
            f"Fetching Levinsohn LGNTDF at {COMMIT_SHA[:12]} and verifying checksums..."
        )
        source_root = provenance.ensure_source_root("levinsohn", XML_STEMS)

    features, index_stems = build_corpus(source_root)
    validate_all_then_write_all(features, index_stems, args.output_dir)
    print(
        f"Wrote {len(features)} feature files and index stub "
        f"({sum(f.source_count for f in features):,} references) to {args.output_dir}"
    )


if __name__ == "__main__":
    main()
