# Masoretic Paragraph Markers - Data Sources

## Overview

This directory contains Masoretic paragraph markers (petuchot and setumot) for all 39 Old Testament books, extracted from the Leningrad Codex via Sefaria-Export.

## Primary Source

**Sefaria-Export** (Masoretic Text, Leningrad Codex)
- **Repository:** https://github.com/Sefaria/Sefaria-Export
- **Text Basis:** Westminster Leningrad Codex (WLC)
- **License:** Public Domain (WLC text) / CC-BY-SA (Sefaria metadata)

## What is Extracted

**Paragraph Markers:**
- **Petuchot (פ)** - "Open" paragraphs (major breaks)
- **Setumot (ס)** - "Closed" paragraphs (minor breaks)

These markers represent ancient manuscript tradition for textual division, predating modern chapter/verse divisions.

## File Format

**JSON Structure:**
```json
{
  "book": "Genesis",
  "petuchot": [
    "1:2",
    "1:5",
    "1:8"
  ],
  "setumot": [
    "1:3",
    "1:6",
    "1:9"
  ]
}
```

**Fields:**
- `book` - English book name
- `petuchot` - Array of verse references (chapter:verse format) with פ markers
- `setumot` - Array of verse references (chapter:verse format) with ס markers

## Extraction Methodology

Data extracted using `scripts/sefaria_paragraphs.py`:
1. Load JSON files from this directory
2. Parse petuchot and setumot arrays
3. Combine and sort by chapter:verse
4. Return verse references with marker types

## Usage in Segmentation

Masoretic paragraph markers are used to:
1. **Validate boundaries** - Ensure session divisions align with ancient manuscript breaks
2. **Justify divisions** - Cite textual evidence for segmentation choices
3. **Prevent violations** - Warn against splitting mid-paragraph

## Validation

To verify data integrity:

```bash
# Test extraction for a book
python3 scripts/sefaria_paragraphs.py Genesis --output json

# Expected output: JSON with verse references and marker types
```

## Last Updated

**Date:** 2026-01-19
**Books Covered:** 39 Old Testament books
**Total Markers:** Varies by book (Genesis has 1034 markers)

## Academic Citation

When citing this data in academic work:

> Masoretic paragraph markers (petuchot and setumot) from Westminster Leningrad Codex via Sefaria-Export. https://github.com/Sefaria/Sefaria-Export (accessed 2026-01-19).

## Related Documentation

- **New Testament discourse features:** See `../levinsohn/README.md` (when available)
- **Extraction script:** `../../scripts/sefaria_paragraphs.py`
- **Usage in skill:** `../../SKILL.md` (Markers column in session tables)
