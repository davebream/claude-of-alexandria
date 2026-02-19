# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-19

### Added

- GitHub Actions workflow to automatically package each skill as a ZIP file and attach to GitHub Releases, enabling direct download for Claude Desktop users

## [1.1.0] - 2026-02-18

### Added

- `allowed-tools` frontmatter to all three command files (`biblical-segmentation`, `pericope-delimitation`, `exegetical-notes`), pre-authorizing `Bash`, `WebSearch`, `Read`, `Write`, and `Glob` so users are not prompted for permission on every tool use

## [1.0.0] - 2026-02-10

### Added

- `biblical-segmentation` skill — divide biblical books into coherent teaching units for sermon series, Bible study, or devotional reading
- `pericope-delimitation` skill — validate whether a biblical passage constitutes a coherent discourse unit and check passage boundaries
- `exegetical-notes` skill — produce structured exegetical analysis of a biblical passage with lexical data, discourse features, and interpretive framework
- Slash commands for all three skills
- TDD verification artifacts (scenarios, baseline, verification) for all three skills
- Levinsohn GNT Discourse Features reference data for NT boundary analysis
- Masoretic paragraph marker reference data (Sefaria-Export) for OT boundary analysis
- Vocabulary frequency reference data for thematic option generation
- `levinsohn_parser.py`, `sefaria_paragraphs.py`, and `vocabulary_parser.py` scripts
- GitHub issue templates

### Fixed

- Plugin source path in `marketplace.json`
- Plugin manifest renamed from `manifest.json` to `plugin.json` for correct discovery
- Removed `disable-model-invocation` from commands
