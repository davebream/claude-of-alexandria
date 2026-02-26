#!/usr/bin/env python3
"""Generate D1 seed SQL for thematic_keywords from semantic_groups.yaml."""
import yaml
import sys

YAML_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
OUTPUT_PATH = "server/d1-seed/thematic-keywords-expansion.sql"

with open(YAML_PATH) as f:
    data = yaml.safe_load(f)

groups = data["semantic_groups"]
lines = [f"-- Thematic keywords expansion: {len(groups)} groups"]
lines.append("-- Generated from semantic_groups.yaml\n")

count = 0
for theme, group in groups.items():
    if "nt_lemmas" in group:
        for lemma in group["nt_lemmas"]:
            escaped_lemma = lemma.replace("'", "''")
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{escaped_lemma}', 'nt');")
            count += 1
    if "ot_strongs" in group:
        for strong_id, info in group["ot_strongs"].items():
            lines.append(f"INSERT OR IGNORE INTO thematic_keywords (theme, lemma, testament) VALUES ('{theme}', '{strong_id}', 'ot');")
            count += 1

with open(OUTPUT_PATH, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Generated {count} INSERT statements for {len(groups)} themes → {OUTPUT_PATH}")
