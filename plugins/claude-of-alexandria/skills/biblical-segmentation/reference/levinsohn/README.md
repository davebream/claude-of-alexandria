# Levinsohn GNT Discourse Features

## Overview

This directory contains discourse feature annotations for all 27 New Testament books, based on Stephen H. Levinsohn's linguistic analysis of the Greek New Testament.

## Academic Citation

**Full Citation:**
> Levinsohn, Stephen H. (dataset 2016; book: Levinsohn 2000). *Levinsohn Greek New Testament Discourse Features*. SIL International.

**Text Basis:** NA28/UBS5 critical text

**License:** SIL International Custom License (not CC-BY-SA — see repository NOTICE file for full terms and required attribution statement)

## What is Discourse Analysis?

Discourse analysis examines how Greek grammar signals paragraph boundaries, topic shifts, and textual structure beyond the sentence level. Levinsohn's work identifies linguistic markers that help determine where natural breaks occur in the text.

## Data Content

**34 JSON files** containing discourse features across the NT:
- 27 canonical books (Matthew - Revelation)
- Additional feature-specific files (Annotations, Ambiguous, etc.)

**Features Analyzed:**
- Historical Present
- Point of Departure (Referential & Situational)
- Left-Dislocation
- Reported Speech
- Tail-Head Linkage
- Focus constructions
- Thematic prominence markers
- ...and 28 additional discourse features

## File Format

**JSON Structure:**
```json
{
  "references": [
    {
      "verse": "Mark 1:12",
      "word": "ἐκβάλλει",
      "type": "Historical Present"
    }
  ]
}
```

**Fields:**
- `verse` - Canonical reference (Book Chapter:Verse)
- `word` - Greek word exhibiting the discourse feature
- `type` - Discourse feature type/label

## Segmentation-Relevant Features

The biblical-segmentation skill uses **6 primary features** to identify natural paragraph and section boundaries:

| Feature | File | Usage |
|---------|------|-------|
| Historical Present | `Historical_Present.json` | Marks narrative progression, new scenes |
| Left-Dislocation | `Left-Dislocation.json` | Signals topic shift or emphasis |
| Referential PoD | `Referential_PoD.json` | Points to new referent (participant introduction) |
| Situational PoD | `Situational_PoD.json` | Marks temporal/locational setting changes |
| Reported Speech | `Reported_Speech.json` | Direct discourse boundaries |
| Tail-Head Linkage | `Tail-Head_linkage.json` | Connects sections while marking transitions |

**Additional 28 features** are available for reference but not used in primary segmentation logic.

## Extraction Tool

**Script:** `../../scripts/levinsohn_parser.py`

**Usage:**
```bash
# Get all segmentation features for Mark
python3 scripts/levinsohn_parser.py Mark

# Get specific features only
python3 scripts/levinsohn_parser.py John --features historical_present,left_dislocation

# List all available features
python3 scripts/levinsohn_parser.py --list-features

# JSON output
python3 scripts/levinsohn_parser.py Matthew --output json
```

## Usage in Segmentation

Discourse features help:
1. **Validate boundaries** - Confirm session breaks align with Greek discourse structure
2. **Identify options** - Discover multiple valid segmentation points
3. **Justify divisions** - Cite linguistic evidence for boundary choices

**Example:**
> Historical Present at Mark 1:21 ("they enter") signals scene change from wilderness (1:12-13) to Capernaum ministry, supporting session boundary.

## Data Provenance

**Source Repository:** https://github.com/biblicalhumanities/levinsohn/tree/master/LGNTDF

**Data Quality:**
- Hand-annotated by trained linguists
- Peer-reviewed within SIL International
- Based on rigorous discourse grammar methodology

## Validation

To verify data integrity:

```bash
# Test extraction for a book
python3 scripts/levinsohn_parser.py Mark --output json

# Expected: JSON with discourse features and verse references
```

## Last Updated

**Date:** 2026-01-19
**Books Covered:** 27 NT books + supplementary feature files
**Total Files:** 34 JSON files

## Related Documentation

- **OT paragraph markers:** See `../masoretic/DATA_SOURCES.md`
- **Extraction script:** `../../scripts/levinsohn_parser.py`
- **Usage in skill:** `../../SKILL.md` (NT segmentation methodology)

## Further Reading

For understanding Levinsohn's discourse grammar framework:
- Levinsohn, S. H. (2015). *Self-Instruction Materials on Narrative Discourse Analysis*. SIL International.
- Runge, S. E. (2010). *Discourse Grammar of the Greek New Testament*. Hendrickson.
