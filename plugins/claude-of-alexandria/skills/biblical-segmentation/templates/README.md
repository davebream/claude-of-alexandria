# Output Templates

This directory contains **reference templates** that define the expected structure of skill output.

## Status

These are **documentation templates**, not executable code. There is no template rendering engine implemented.

## Purpose

Templates show the expected format for skill-generated output:
- Field names and structure
- Required vs. optional sections
- Formatting conventions
- Output organization

## Contents

**`segmentation-output.md`** - Reference template showing structure for segmentation results:
- Book overview section
- Multiple segmentation options (2-4)
- Session tables with passages, titles, verses, markers
- Comparative notes between options
- Integrity verification checklist
- Framework notes for contested books

## Usage

When the biblical-segmentation skill generates output, it should match the structure defined in `segmentation-output.md`:

1. **Agents read the template** to understand expected output format
2. **Agents generate output** matching the template structure
3. **Users receive** consistently formatted segmentation results

Templates serve as **specification documents**, not code to be executed.

## Adding Templates

If creating additional templates:
- Use Handlebars-style placeholders (`{variable}`, `{#each}...{/each}`)
- Document required vs. optional fields
- Add explanation of template purpose to this README
- Keep templates in sync with SKILL.md output requirements

## Maintenance

**Last validated:** 2026-01-19

Templates should be reviewed whenever:
- SKILL.md output requirements change
- New output sections are added
- Field names or structure evolve

## Relationship to SKILL.md

- **SKILL.md** - Defines skill behavior, rules, and methodology
- **Templates** - Show *what* the output looks like
- Both must stay synchronized

## Non-Goals

This is **not**:
- A Jinja2/Handlebars rendering system
- Executable template code
- Automatic output generation

Templates are purely documentation showing the expected output structure.
