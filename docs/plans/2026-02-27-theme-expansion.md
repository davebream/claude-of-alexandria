# Theme Expansion: Biblical-Theological Gap Fill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use kombajn-dev:build to implement this plan task-by-task.

**Goal:** Expand `thematic_keywords` from 69 to ~82-85 themes by (1) running an empirical gap analysis against the full vocabulary corpus, (2) adding missing biblically-significant themes to `semantic_groups.yaml`, (3) densifying sparse existing themes, and (4) deploying to remote D1 without a full re-seed.

**Architecture:** `semantic_groups.yaml` is the sole source of truth. A Python gap-analysis script mines `nt_lemmas.yaml` and `ot_lemmas.yaml` to surface uncovered high-frequency lemmas. New themes and lemma additions go into the YAML. `gen-thematic-keywords.py` regenerates the SQL. A new `seed-themes-only.sh` re-seeds only `thematic_keywords` (avoiding the 89-chunk morphology re-import that takes ~20 minutes).

**Tech Stack:** Python 3 + PyYAML (already installed, used by existing scripts), Wrangler CLI (`npx wrangler`), Cloudflare D1 remote

---

## File Map

| File | Action |
|---|---|
| `server/scripts/analyze-theme-gaps.py` | **Create** — gap analysis script |
| `server/scripts/seed-themes-only.sh` | **Create** — lightweight re-seed (themes only) |
| `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml` | **Modify** — add new themes and densify sparse ones |
| `server/d1-seed/thematic-keywords-expansion.sql` | **Regenerated** — never edit directly |

---

## Task 1: Write Gap Analysis Script

**Files:**
- Create: `server/scripts/analyze-theme-gaps.py`

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Analyze which high-frequency biblical lemmas are not covered by any existing theme.

Usage (run from repo root):
  python3 server/scripts/analyze-theme-gaps.py
  python3 server/scripts/analyze-theme-gaps.py --min-freq 20
  python3 server/scripts/analyze-theme-gaps.py --testament nt
"""
import argparse
import yaml
from pathlib import Path

SEMANTIC_GROUPS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml"
NT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt_lemmas.yaml"
OT_LEMMAS_PATH = "plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/ot_lemmas.yaml"


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def get_covered_lemmas(semantic_groups):
    """Return set of all lemmas already covered by any theme."""
    covered_nt = set()
    covered_ot = set()
    for theme, group in semantic_groups["semantic_groups"].items():
        for lemma in group.get("nt_lemmas", {}):
            covered_nt.add(lemma)
        for strong_id in group.get("ot_strongs", {}):
            covered_ot.add(strong_id)
    return covered_nt, covered_ot


def get_canon_frequencies_nt(nt_lemmas):
    """Return {lemma: total_across_canon} for NT."""
    totals = {}
    for book, book_data in nt_lemmas.get("books", {}).items():
        for lemma, lemma_data in book_data.get("lemmas", {}).items():
            totals[lemma] = totals.get(lemma, 0) + lemma_data.get("total", 0)
    return totals


def get_canon_frequencies_ot(ot_lemmas):
    """Return {strong_id: total_across_canon} for OT."""
    totals = {}
    for book, book_data in ot_lemmas.get("books", {}).items():
        for strong_id, lemma_data in book_data.get("lemmas", {}).items():
            totals[strong_id] = totals.get(strong_id, 0) + lemma_data.get("total", 0)
    return totals


def get_existing_theme_density(semantic_groups):
    """Return themes with fewer than N lemmas (sparse coverage)."""
    sparse = []
    for theme, group in semantic_groups["semantic_groups"].items():
        nt_count = len(group.get("nt_lemmas", {}))
        ot_count = len(group.get("ot_strongs", {}))
        if nt_count <= 1 or ot_count <= 1:
            sparse.append({
                "theme": theme,
                "nt_lemmas": nt_count,
                "ot_strongs": ot_count,
            })
    return sorted(sparse, key=lambda x: x["nt_lemmas"] + x["ot_strongs"])


def main():
    parser = argparse.ArgumentParser(description="Analyze theme coverage gaps")
    parser.add_argument("--min-freq", type=int, default=10, help="Min canon-wide frequency to report")
    parser.add_argument("--testament", choices=["nt", "ot", "both"], default="both")
    parser.add_argument("--top", type=int, default=50, help="Show top N uncovered lemmas")
    args = parser.parse_args()

    semantic = load_yaml(SEMANTIC_GROUPS_PATH)
    covered_nt, covered_ot = get_covered_lemmas(semantic)

    print(f"\n=== EXISTING COVERAGE ===")
    print(f"Themes: {len(semantic['semantic_groups'])}")
    print(f"NT lemmas covered: {len(covered_nt)}")
    print(f"OT strongs covered: {len(covered_ot)}")

    if args.testament in ("nt", "both"):
        nt_lemmas = load_yaml(NT_LEMMAS_PATH)
        nt_freqs = get_canon_frequencies_nt(nt_lemmas)
        uncovered_nt = {
            lemma: freq
            for lemma, freq in nt_freqs.items()
            if lemma not in covered_nt and freq >= args.min_freq
        }
        ranked_nt = sorted(uncovered_nt.items(), key=lambda x: -x[1])

        print(f"\n=== TOP {args.top} UNCOVERED NT LEMMAS (min freq={args.min_freq}) ===")
        print(f"Total uncovered NT lemmas with freq >= {args.min_freq}: {len(uncovered_nt)}")
        print(f"{'Rank':<5} {'Frequency':<10} {'Lemma'}")
        print("-" * 40)
        for i, (lemma, freq) in enumerate(ranked_nt[:args.top], 1):
            print(f"{i:<5} {freq:<10} {lemma}")

    if args.testament in ("ot", "both"):
        ot_lemmas = load_yaml(OT_LEMMAS_PATH)
        ot_freqs = get_canon_frequencies_ot(ot_lemmas)
        uncovered_ot = {
            strong_id: freq
            for strong_id, freq in ot_freqs.items()
            if strong_id not in covered_ot and freq >= args.min_freq
        }
        ranked_ot = sorted(uncovered_ot.items(), key=lambda x: -x[1])

        print(f"\n=== TOP {args.top} UNCOVERED OT STRONGS (min freq={args.min_freq}) ===")
        print(f"Total uncovered OT lemmas with freq >= {args.min_freq}: {len(uncovered_ot)}")
        print(f"{'Rank':<5} {'Frequency':<10} {'Strong ID'}")
        print("-" * 40)
        for i, (strong_id, freq) in enumerate(ranked_ot[:args.top], 1):
            print(f"{i:<5} {freq:<10} {strong_id}")

    print(f"\n=== SPARSE EXISTING THEMES (≤1 NT or ≤1 OT lemma) ===")
    sparse = get_existing_theme_density(semantic)
    print(f"{'Theme':<30} {'NT lemmas':<12} {'OT strongs'}")
    print("-" * 55)
    for item in sparse:
        print(f"{item['theme']:<30} {item['nt_lemmas']:<12} {item['ot_strongs']}")


if __name__ == "__main__":
    main()
```

**Step 2: Run from repo root and capture output**

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria
python3 server/scripts/analyze-theme-gaps.py --min-freq 15 --top 60 2>&1 | tee /tmp/theme-gap-analysis.txt
cat /tmp/theme-gap-analysis.txt
```

Expected: A ranked list of uncovered NT and OT lemmas, plus sparse themes.

**Step 3: Commit the script**

```bash
git add server/scripts/analyze-theme-gaps.py
git commit -m "feat(data): add theme gap analysis script"
```

---

## Task 2: Interpret Gap Analysis — New Theme List

**This task is analytical, not code-writing.** Run the gap analysis and determine which uncovered lemmas cluster into new themes.

**Step 1: Re-read the gap output**

The analysis will surface lemmas like these (based on known corpus frequencies — confirm against actual output):

| NT Lemma | English | Likely new theme |
|---|---|---|
| θεός | God | **deity** |
| κύριος | Lord | **deity** |
| Ἰησοῦς | Jesus | *proper name — skip* |
| Χριστός | Christ/Messiah | **christology** |
| προσεύχομαι | pray | **prayer** |
| προσευχή | prayer | **prayer** |
| λόγος | word | **word-revelation** |
| γραφή / γράφω | scripture / write | **word-revelation** |
| φῶς | light | **light-darkness** |
| σκοτία / σκότος | darkness | **light-darkness** |
| ἄνθρωπος | human being | **humanity** |
| εἰκών | image | **humanity** |
| ταπεινόω | humble | **humility-pride** |
| ὑπερηφανία | arrogance | **humility-pride** |
| πτωχός | poor | **wealth-poverty** |
| πλοῦτος | wealth | **wealth-poverty** |
| εὐαγγελίζω | proclaim good news | **gospel-mission** |
| εὐαγγέλιον | gospel | **gospel-mission** |
| κηρύσσω | preach/herald | **gospel-mission** |
| λαός | people | **peoples-nations** |
| ἔθνος | nation/gentile | **peoples-nations** |
| προφήτης | prophet | **prophecy** |
| ἁγνός / ἁγνίζω | pure / purify | *extend existing purification* |
| θεραπεύω / ἰάομαι | heal | **healing** |
| μαρτύριον | testimony | *extend existing confession-witness* |

**Step 2: Determine final theme list**

After reviewing the actual gap output, finalize this list of themes to add (adjust based on actual frequencies):

1. `deity` — God, Lord, divine nature
2. `christology` — Christ, Son, Messiah (NT-heavy, mapped to Servant/Anointed in OT)
3. `prayer` — pray, petition, intercession
4. `word-revelation` — word/logos, scripture, written word
5. `light-darkness` — light/darkness contrast
6. `humanity` — human being, image of God
7. `humility-pride` — humility vs. arrogance
8. `wealth-poverty` — rich/poor, money, possessions
9. `gospel-mission` — gospel, proclamation, mission
10. `peoples-nations` — Israel, people, Gentiles, nations
11. `prophecy` — prophet, prophesy, fulfillment
12. `healing` — heal, cure, restoration of body

**Sparse themes to densify (identified from sparse list):**
- `covenant` (1 NT lemma) — add: σπέρμα (seed/offspring), μεσίτης (mediator)
- `prayer` is currently MISSING entirely from 69 themes
- `vanity` (OT only) — add NT: μάταιος, κενός
- `oracle` (1 NT lemma) — add: προφητεία, λόγιον

No code in this task. Document decisions in a comment added to the semantic_groups.yaml header before editing.

---

## Task 3: Add New Themes to semantic_groups.yaml

**Files:**
- Modify: `plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml`

This is the largest task. Add all new theme entries following the exact YAML structure of existing entries. Work theme-by-theme.

**Recommended checkpoint split:** After Steps 1-13 (adding 12 new themes), run the YAML validation from Step 15 and create an intermediate git commit before proceeding to Steps 14-15 (sparse theme densification). This prevents a typo in densification from dirtying a known-good set of 12 new themes.

**Step 1: Understand the structure (read first 80 lines of the file)**

Each theme entry looks like:
```yaml
  theme-name:
    description: One-sentence theological concept description
    primary_genres: [epistle, gospel_narrative]  # most relevant literary genres
    nt_lemmas:
      λεξιc: English gloss
      λεξis2: English gloss
    ot_strongs:
      H1234:
        hebrew: הֶבְרֶּ
        gloss: English gloss
```

**Step 2: Add `deity` theme**

Append after the existing `truth` theme (~line 200 of the file, where the core theological virtue cluster ends — do NOT insert after `name`, which is near the end of the file):

```yaml
  deity:
    description: God, Lord, divine nature and being — the identity and attributes of God across both testaments
    primary_genres: [epistle, gospel_narrative, hebrew_poetry, prophetic]
    nt_lemmas:
      θεός: God, deity
      κύριος: Lord, master
      θεότης: deity, divine nature (Col 2:9)
      θεῖος: divine, of God (2 Pet 1:3-4)
      θειότης: divinity (Rom 1:20)
    ot_strongs:
      H430:
        hebrew: אֱלֹהִים
        gloss: God, gods, divine beings
      H3068:
        hebrew: יְהוָה
        gloss: LORD (Yahweh), the personal name of God
      H136:
        hebrew: אֲדֹנָי
        gloss: Lord, my Lord
      H7706:
        hebrew: שַׁדַּי
        gloss: Almighty, Shaddai
```

**Step 3: Add `christology` theme**

```yaml
  christology:
    description: Christ, Messiah, Son of God — the identity and titles of Jesus as the anointed one
    primary_genres: [gospel_narrative, epistle, prophetic]
    nt_lemmas:
      Χριστός: Christ, Messiah, Anointed One
      υἱός: Son (as title/relationship)  # NOTE: ~260 non-titular uses (parables, genealogies); agents must use literary context to determine titular vs. kinship sense
      μονογενής: only-begotten, one and only
      # λόγος intentionally omitted: also in word-revelation; Johannine "Word" title is exegetically specific and better captured via literary context than lemma frequency
    ot_strongs:
      H4899:
        hebrew: מָשִׁיחַ
        gloss: anointed one, Messiah
      H5650:
        hebrew: עֶבֶד
        gloss: servant (Servant Songs of Isaiah)
      # H6629 (צֹאן, flock/sheep) intentionally omitted: too generic (appears throughout Pentateuchal narratives). Use H7716 (שֶׂה, lamb) or H3532 (כֶּבֶשׂ, ram/lamb) for sacrificial imagery instead — verify against ot_lemmas.yaml before adding
```

**Step 4: Add `prayer` theme**

```yaml
  prayer:
    description: Prayer, petition, intercession — communicating with God in supplication and praise
    primary_genres: [epistle, hebrew_poetry, gospel_narrative]
    nt_lemmas:
      προσεύχομαι: pray, make prayer
      προσευχή: prayer (noun)
      δέομαι: ask, beg, pray
      δέησις: request, prayer, petition
      ἐντυγχάνω: intercede, appeal to
      αἰτέω: ask, request
    ot_strongs:
      H6419:
        hebrew: פָּלַל
        gloss: pray, intercede, make supplication
      H8605:
        hebrew: תְּפִלָּה
        gloss: prayer, intercession
      H7592:
        hebrew: שָׁאַל
        gloss: ask, inquire, request
```

**Step 5: Add `word-revelation` theme**

```yaml
  word-revelation:
    description: Word, scripture, divine revelation — God's communication through word and written text
    primary_genres: [epistle, gospel_narrative, prophetic]
    nt_lemmas:
      λόγος: word, message, account
      ῥῆμα: word, saying, utterance
      γραφή: scripture, writing
      γράφω: write, record
      ἀποκάλυψις: revelation, disclosure
    ot_strongs:
      H1697:
        hebrew: דָּבָר
        gloss: word, matter, thing
      H3791:
        hebrew: כָּתַב
        gloss: write, inscribe
      H6310:
        hebrew: פֶּה
        gloss: mouth, command, word
      H2377:
        hebrew: חָזוֹן
        gloss: vision, revelation
```

**Step 6: Add `light-darkness` theme**

```yaml
  light-darkness:
    description: Light and darkness — moral, spiritual, and eschatological contrast between God's realm and opposition
    primary_genres: [gospel_narrative, epistle, hebrew_poetry, prophetic]
    nt_lemmas:
      φῶς: light
      φαίνω: shine, appear, give light
      σκοτία: darkness
      σκότος: darkness (noun)
      φωτίζω: illuminate, enlighten
    ot_strongs:
      H216:
        hebrew: אוֹר
        gloss: light, daylight
      H215:
        hebrew: אוֹר
        gloss: be light, shine
      H2822:
        hebrew: חֹשֶׁך
        gloss: darkness, obscurity
      H5050:
        hebrew: נָגַהּ
        gloss: shine, give light
```

**Step 7: Add `humanity` theme**

```yaml
  humanity:
    description: Human being, image of God — the nature, dignity, and creatureliness of humanity
    primary_genres: [epistle, ot_narrative, hebrew_poetry]
    nt_lemmas:
      ἄνθρωπος: human being, man, person
      εἰκών: image, likeness
      ψυχή: soul, life, person
      σῶμα: body (as human nature, distinct from body-church ecclesiology)  # Shared with body-church theme; humanity-sense = embodied human nature, not ecclesiological
    ot_strongs:
      H120:
        hebrew: אָדָם
        gloss: human, mankind, Adam
      H6754:
        hebrew: צֶלֶם
        gloss: image, likeness
      H5315:
        hebrew: נֶפֶשׁ
        gloss: soul, life, person, self
      H1320:
        hebrew: בָּשָׂר
        gloss: flesh, body (human nature)  # Shared with flesh theme; humanity-sense = creatureliness (Gen 2), not sin-nature (Paul)
```

**Step 8: Add `humility-pride` theme**

```yaml
  humility-pride:
    description: Humility and pride — the contrast between lowliness before God and self-exaltation
    primary_genres: [epistle, hebrew_poetry, wisdom]
    nt_lemmas:
      ταπεινόω: humble, bring low
      ταπεινός: lowly, humble
      ταπεινοφροσύνη: humility, lowliness of mind
      ὑπερηφανία: arrogance, pride
      ὑψόω: exalt, lift up
    ot_strongs:
      H6041:
        hebrew: עָנִי
        gloss: poor, afflicted, humble
      H8217:
        hebrew: שָׁפָל
        gloss: low, humble
      H1347:
        hebrew: גָּאוֹן
        gloss: pride, arrogance, majesty
      H7311:
        hebrew: רוּם
        gloss: be high, exalt, rise up
```

**Step 9: Add `wealth-poverty` theme**

```yaml
  wealth-poverty:
    description: Wealth and poverty — material resources, their dangers, and God's concern for the poor
    primary_genres: [epistle, gospel_narrative, hebrew_poetry, wisdom]
    nt_lemmas:
      πλοῦτος: wealth, riches
      πλούσιος: rich, wealthy
      πτωχός: poor, destitute
      χρῆμα: money, wealth
      μαμωνᾶς: mammon, material wealth
    ot_strongs:
      H6238:
        hebrew: עָשַׁר
        gloss: be rich, enrich
      H1952:
        hebrew: הוֹן
        gloss: wealth, riches
      H7326:
        hebrew: רוּשׁ
        gloss: be poor, impoverished
      H1800:
        hebrew: דַּל
        gloss: poor, weak, thin
```

**Step 10: Add `gospel-mission` theme**

```yaml
  gospel-mission:
    description: Gospel proclamation and mission — the announcement of good news and its spread
    primary_genres: [gospel_narrative, epistle, acts_narrative]
    nt_lemmas:
      εὐαγγέλιον: gospel, good news
      εὐαγγελίζω: proclaim good news, evangelize
      κηρύσσω: preach, proclaim, herald
      κήρυγμα: proclamation, preaching
      ἀποστέλλω: send, commission
    ot_strongs:
      H1319:
        hebrew: בָּשַׂר
        gloss: bear good news, proclaim
      H7121:
        hebrew: קָרָא
        gloss: call, proclaim, announce
      H7971:
        hebrew: שָׁלַח
        gloss: send, commission
```

**Step 11: Add `peoples-nations` theme**

```yaml
  peoples-nations:
    description: Israel, peoples, and nations — the people of God and their relationship to all nations
    primary_genres: [ot_narrative, prophetic, epistle, gospel_narrative]
    nt_lemmas:
      λαός: people (especially God's people)
      ἔθνος: nation, Gentile, people group
      Ἰσραήλ: Israel
      Ἰουδαῖος: Jew, Judean
    ot_strongs:
      H5971:
        hebrew: עַם
        gloss: people, nation, kinsmen
      H1471:
        hebrew: גּוֹי
        gloss: nation, people (often non-Israelite)
      H3478:
        hebrew: יִשְׂרָאֵל
        gloss: Israel
      H7626:
        hebrew: שֵׁבֶט
        gloss: tribe, rod, scepter
```

**Step 12: Add `prophecy` theme**

```yaml
  prophecy:
    description: Prophecy and fulfillment — the prophetic word, its speakers, and its realization
    primary_genres: [prophetic, gospel_narrative, epistle]
    nt_lemmas:
      προφήτης: prophet
      προφητεύω: prophesy
      προφητεία: prophecy
      πληρόω: fulfill (in context of scripture/prophecy)
    ot_strongs:
      H5030:
        hebrew: נָבִיא
        gloss: prophet, spokesman
      H2372:
        hebrew: חָזָה
        gloss: see (prophetic vision), behold
      H5012:
        hebrew: נָבָא
        gloss: prophesy, speak as prophet
```

**Step 13: Add `healing` theme**

```yaml
  healing:
    description: Healing and restoration of body — physical healing as sign of God's restorative power
    primary_genres: [gospel_narrative, epistle]
    nt_lemmas:
      θεραπεύω: heal, cure, serve
      ἰάομαι: heal, cure
      ἴασις: healing, cure
      ἀσθένεια: weakness, illness, infirmity
    ot_strongs:
      H7495:
        hebrew: רָפָא
        gloss: heal, cure, restore
      H2470:
        hebrew: חָלָה
        gloss: be sick, become ill, be weak
```

**Step 14: Densify sparse existing themes**

Open `semantic_groups.yaml` and add missing lemmas to these thin themes:

**`covenant`** (currently 1 NT lemma: διαθήκη) — append to its existing `nt_lemmas` block:
```yaml
      σπέρμα: seed, offspring (covenant lineage)
      μεσίτης: mediator (of covenant)
```

**`oracle`** (currently 1 NT lemma: χρηματισμός) — append to its existing `nt_lemmas` block:
```yaml
      προφητεία: prophecy, prophetic word
      λόγιον: oracle, divine saying
```

**`vanity`** (currently OT-only) — add a new `nt_lemmas` section (the section does not exist yet):
```yaml
    nt_lemmas:
      μάταιος: futile, empty, vain
      κενός: empty, vain, without result
      ματαιότης: futility, vanity
```

**`remnant`** (currently 1 NT lemma: λεῖμμα) — append to its existing `nt_lemmas` block:
```yaml
      κατάλοιπος: remaining, left over
```

**Step 15: Verify YAML is valid and update metadata count**

```bash
python3 -c "
import yaml
with open('plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml') as f:
    data = yaml.safe_load(f)
groups = data['semantic_groups']
print(f'Themes: {len(groups)}')
total_nt = sum(len(g.get(\"nt_lemmas\", {})) for g in groups.values())
total_ot = sum(len(g.get(\"ot_strongs\", {})) for g in groups.values())
print(f'NT lemmas total: {total_nt}')
print(f'OT strongs total: {total_ot}')
print(f'Current metadata count: {data[\"metadata\"][\"semantic_groups_count\"]}')
"
```

Expected: `Themes: 81` (or similar), no errors.

Then update the `metadata.semantic_groups_count` field at the top of the YAML to match the actual theme count printed above:

```yaml
metadata:
  semantic_groups_count: 81  # update to actual count
```

**Do NOT commit yet — wait until SQL regenerated and verified.**

---

## Task 4: Regenerate SQL and Verify Coverage

**Files:**
- Regenerate: `server/d1-seed/thematic-keywords-expansion.sql`

**Step 1: Run the generator**

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria
python3 server/scripts/gen-thematic-keywords.py
```

Expected output: `Generated NNN INSERT statements for 81 themes → server/d1-seed/thematic-keywords-expansion.sql`

**Step 2: Spot-check the generated SQL**

```bash
grep "deity" server/d1-seed/thematic-keywords-expansion.sql
grep "prayer" server/d1-seed/thematic-keywords-expansion.sql
grep "θεός" server/d1-seed/thematic-keywords-expansion.sql
```

Expected: Multiple INSERT rows for each.

**Step 3 (OT verification — runs against ot_lemmas.yaml only): Verify OT Strong's IDs for all 12 new themes**

Note: `verify-thematic-coverage.py` is OT-only. Run it for ALL new themes, not just a sample.

```bash
for theme in deity christology prayer word-revelation light-darkness humanity \
             humility-pride wealth-poverty gospel-mission peoples-nations prophecy healing; do
  echo "--- $theme ---"
  python3 server/scripts/verify-thematic-coverage.py --theme "$theme"
done
```

Expected: All ✓ marks for all themes (no DATA GAP warnings). If any show `✗ 0 occurrences`, that Strong's ID is wrong or absent from the OT corpus — fix in the YAML before proceeding.

**Step 3b (NT verification — mandatory): Verify all new NT lemmas exist in the corpus**

```bash
python3 -c "
import yaml

with open('plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/nt_lemmas.yaml') as f:
    nt_data = yaml.safe_load(f)
corpus_lemmas = set()
for book_data in nt_data['books'].values():
    corpus_lemmas.update(book_data.get('lemmas', {}).keys())

with open('plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml') as f:
    sg = yaml.safe_load(f)

new_themes = ['deity','christology','prayer','word-revelation','light-darkness',
              'humanity','humility-pride','wealth-poverty','gospel-mission',
              'peoples-nations','prophecy','healing']
issues = 0
for theme in new_themes:
    group = sg['semantic_groups'].get(theme, {})
    for lemma in group.get('nt_lemmas', {}):
        status = 'OK' if lemma in corpus_lemmas else 'NOT IN CORPUS'
        if status != 'OK':
            print(f'  WARN: {theme}: {lemma} -> {status}')
            issues += 1
if issues == 0:
    print('All new NT lemmas found in corpus.')
"
```

Expected: `All new NT lemmas found in corpus.` If any show `NOT IN CORPUS`, that entry is an inflected form or typo — fix in the YAML before proceeding.

**Step 4: Re-run gap analysis to confirm improvement**

```bash
python3 server/scripts/analyze-theme-gaps.py --min-freq 15 --top 30
```

Expected: θεός, κύριος, προσεύχομαι, λόγος etc. now absent from uncovered list.

**Step 5: Update CHANGELOG and commit the YAML and SQL together**

First, check the current version in `.claude-plugin/marketplace.json` and bump the minor version (X.Y.Z → X.Y+1.0) for this data expansion. Then update `CHANGELOG.md` at the repo root, adding a new version entry under "Added":

```markdown
### Added
- 12 new thematic keyword groups: deity, christology, prayer, word-revelation, light-darkness, humanity, humility-pride, wealth-poverty, gospel-mission, peoples-nations, prophecy, healing
- Densified 4 sparse themes: covenant, oracle, vanity, remnant
```

Then commit:

```bash
git add plugins/claude-of-alexandria/skills/biblical-segmentation/reference/vocabulary/semantic_groups.yaml
git add server/d1-seed/thematic-keywords-expansion.sql
git add CHANGELOG.md
git commit -m "feat(data): expand themes from 69 to 81 with biblical-theological gap fill"
```

---

## Task 5: Write Lightweight Theme Re-seed Script

**Files:**
- Create: `server/scripts/seed-themes-only.sh`

This avoids re-running the 89-chunk morphology import (~20 minutes) when only themes changed.

**Step 1: Write the script**

Design note: `seed-d1.sh` avoids multi-statement transactions in `--file` calls for DDL (see its line 16 comment). Follow the same pattern here: use `--command` for the DELETE, then `--file` for the plain INSERT SQL. The `thematic-keywords-expansion.sql` is already plain `INSERT OR IGNORE` statements — no transaction wrapper needed.

If the `--file` call fails mid-import, re-run both steps from the top (DELETE clears partial state, INSERTs re-populate).

```bash
#!/bin/bash
set -e

DB_NAME="claude-of-alexandria"
SEED_DIR="$(dirname "$0")/../d1-seed"

echo "=== Re-seeding thematic_keywords only: $DB_NAME ==="

# Step 1: Clear existing data
echo "Clearing existing thematic keywords..."
npx wrangler d1 execute "$DB_NAME" --command="DELETE FROM thematic_keywords;" --remote
echo "  Cleared."

# Step 2: Import updated thematic keywords
echo "Importing thematic keywords expansion..."
npx wrangler d1 execute "$DB_NAME" --file="$SEED_DIR/thematic-keywords-expansion.sql" --remote
echo "  Imported."

# Verify count
echo "Verifying..."
npx wrangler d1 execute "$DB_NAME" --command="SELECT COUNT(*) as total_rows FROM thematic_keywords;" --remote
npx wrangler d1 execute "$DB_NAME" --command="SELECT COUNT(DISTINCT theme) as total_themes FROM thematic_keywords;" --remote

echo "=== Theme re-seed complete ==="
```

**Step 2: Make executable**

```bash
chmod +x server/scripts/seed-themes-only.sh
```

**Step 3: Commit**

```bash
git add server/scripts/seed-themes-only.sh
git commit -m "feat(scripts): add seed-themes-only.sh for lightweight theme redeployment"
```

---

## Task 6: Deploy to Remote D1

**Step 1: Pre-flight check — verify the SQL to be deployed**

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria
echo "SQL rows to be imported:"
grep -c "^INSERT" server/d1-seed/thematic-keywords-expansion.sql
# Expected: ~455 (was ~250 before this expansion)
```

If the count is not plausibly higher than the previous count (~250), the SQL was not regenerated — do not proceed.

**Step 2: Run from server directory**

Note: No Worker redeploy is required. D1 is queried at runtime; the data change is immediately visible after seeding completes.

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria/server
bash scripts/seed-themes-only.sh
```

Expected output:
```
=== Re-seeding thematic_keywords only: claude-of-alexandria ===
Clearing existing thematic keywords...
  Cleared.
Importing thematic keywords expansion...
  Imported.
Verifying...
┌────────────┐
│ total_rows │
├────────────┤
│ 450+       │   ← will be higher than before (was ~250 rows)
└────────────┘
┌──────────────┐
│ total_themes │
├──────────────┤
│ 81           │   ← or whatever final count is
└──────────────┘
=== Theme re-seed complete ===
```

**Troubleshooting: If the `--file` import fails mid-way**

The script uses DELETE then `--file` as two separate calls (no transaction wrapper). If the `--file` call fails mid-import, the table may have partial data. Recovery is simple: re-run the full script from the top. The DELETE in step 1 clears any partial state, and the `--file` call re-populates cleanly. Use `INSERT OR IGNORE` (already in the SQL) so re-running is safe.

If D1 rejects the file due to statement count limits, split the INSERT file:

```bash
# From repo root
TOTAL=$(grep -c "^INSERT" server/d1-seed/thematic-keywords-expansion.sql)
HALF=$((TOTAL / 2))

# Part 1: first half of INSERTs
head -n "$HALF" server/d1-seed/thematic-keywords-expansion.sql > /tmp/themes-part1.sql

# Part 2: second half
tail -n "+$((HALF + 1))" server/d1-seed/thematic-keywords-expansion.sql > /tmp/themes-part2.sql

cd server
npx wrangler d1 execute claude-of-alexandria --command="DELETE FROM thematic_keywords;" --remote
npx wrangler d1 execute claude-of-alexandria --file=/tmp/themes-part1.sql --remote
npx wrangler d1 execute claude-of-alexandria --file=/tmp/themes-part2.sql --remote
```

If Part 2 fails: re-run from the `--command DELETE` step (not from Part 2 alone — the INSERT OR IGNORE is idempotent but a fresh DELETE ensures clean state).

---

## Task 7: Verify the Deployment

**Step 1: Test the originally failing theme**

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria/server
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT lemma FROM thematic_keywords WHERE theme='deity' AND testament='nt' ORDER BY lemma;" \
  --remote
```

Expected: Rows for θεός, κύριος, θεότης, θεῖος, θειότης.

**Step 2: Test a new theme**

```bash
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT lemma FROM thematic_keywords WHERE theme='prayer' AND testament='nt';" \
  --remote
```

Expected: Rows for προσεύχομαι, προσευχή, δέομαι, δέησις, ἐντυγχάνω, αἰτέω.

**Step 3: Test theme count**

```bash
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT theme, COUNT(*) as lemma_count FROM thematic_keywords WHERE testament='nt' GROUP BY theme ORDER BY theme;" \
  --remote
```

Expected: 81 rows (or final count), all showing ≥ 1 lemma.

**Step 4: Confirm old themes still work**

```bash
npx wrangler d1 execute claude-of-alexandria \
  --command="SELECT COUNT(*) FROM thematic_keywords WHERE theme='joy';" \
  --remote
```

Expected: 4 rows (unchanged from before).

---

## Task 8: Final Checks and Commit

After successful deployment verification:

**Step 1: Check SKILL.md for theme count references**

```bash
grep -n "theme\|69\|81\|82\|83\|84\|85" plugins/claude-of-alexandria/skills/biblical-segmentation/SKILL.md | head -20
```

If the skill references the old theme count (69) or lists themes, update it to reflect the expanded coverage. Commit any changes: `docs(skill): update biblical-segmentation theme count to N`.

**Step 2: Verify clean working tree**

```bash
cd /Users/dawid/code/claude/toolboxes/claude-of-alexandria
git status
```

All changes should already be committed from Tasks 1, 3/4, and 5. Expected: clean working tree. If any files appear:
- `/tmp/` files: do NOT commit
- `server/scripts/seed-themes-only.sh`: already committed in Task 5; if modified, review the diff and commit if intentional

---

## Summary of Changes

| Change | Files |
|---|---|
| Gap analysis script (new) | `server/scripts/analyze-theme-gaps.py` |
| Themes-only seed script (new) | `server/scripts/seed-themes-only.sh` |
| 12 new themes + sparse theme densification | `semantic_groups.yaml` |
| Regenerated SQL (never edit directly) | `thematic-keywords-expansion.sql` |

**Themes added:** deity, christology, prayer, word-revelation, light-darkness, humanity, humility-pride, wealth-poverty, gospel-mission, peoples-nations, prophecy, healing

**Themes densified:** covenant, oracle, vanity, remnant

**Theme count:** 69 → ~81
