# Phase 1: Quick Wins + Argument-Flow Skill

> **Date:** 2026-02-24
> **Status:** Design approved, pending implementation
> **Scope:** Q1 (OT quotes MCP tool), Q2 (semantic groups expansion), Q5 (conjunction pattern), S2 (argument-flow skill)
> **Source:** [StudyWith Review Gap Analysis](../reviews/2026-02-24-studywith-review-gap-analysis.md)

---

## Overview

Four work items that build on existing data and infrastructure:

| Item | Type | Effort | TDD Required |
|------|------|--------|-------------|
| Q1 — `query_ot_quotes` MCP tool | New MCP tool + data merge | ~half day | No (server tooling) |
| Q2 — Expand semantic groups to 69 | YAML data + D1 seed | ~3 hours | No (data addition) |
| Q5 — Conjunction querying pattern | Skill documentation | ~1 hour | No (clarifying existing instructions) |
| S2 — `argument-flow` skill | New skill | ~2-3 days | Yes |

---

## Q1: `query_ot_quotes` MCP Tool

### Problem

We have `OT_quotes.json` (691 entries from Levinsohn) bundled in reference data, identifying Greek quotation text within NT verses. But:
- It's not served via MCP (agents must Read a flat file)
- It has no OT source reference (doesn't say "quotes Isaiah 7:14")

### Solution

Merge Levinsohn data with STEPBible `ot_in_nt_refs.json` (493 entries with OT source refs), ingest into D1, serve via new MCP tool.

### Data Pipeline

```
Levinsohn OT_quotes.json (691 entries)
  Fields: verse, word (Greek), type
  Source: github.com/biblicalhumanities/levinsohn
  License: CC BY-SA

STEPBible ot_in_nt_refs.json (493 entries)
  Fields: NT ref (OSIS), OT source ref(s), quotation text (English)
  Source: stepbible.org/html/json/ot_in_nt_refs.json
  License: CC BY 4.0 (GitHub repo) / CC BY-NC 3.0 (blogspot) — CONFIRM BEFORE SHIPPING

Merge script (Python):
  1. Normalize verse formats (Levinsohn "Matt 1:23" → STEPBible "Matt.1:23")
  2. Join on NT verse reference
  3. Add ot_source field from STEPBible
  4. Handle many-to-many (Levinsohn splits multi-part quotes per verse)
  5. Output d1-seed/ot-quotes.sql
```

**License fallback:** If STEPBible confirms NC-only, author the OT source mappings ourselves using Blue Letter Bible parallel passages (~900 entries, publicly viewable) as scholarly reference. It's 493 entries, not thousands.

### D1 Schema

```sql
CREATE TABLE ot_quotes (
  id INTEGER PRIMARY KEY,
  nt_book TEXT NOT NULL,
  nt_chapter INTEGER NOT NULL,
  nt_verse INTEGER NOT NULL,
  greek_text TEXT NOT NULL,
  ot_source TEXT,              -- e.g. "Isa 7:14" (nullable until merge complete)
  ot_source_multiple TEXT      -- semicolon-separated when multiple sources
);
CREATE INDEX idx_ot_quotes_nt ON ot_quotes(nt_book, nt_chapter, nt_verse);
CREATE INDEX idx_ot_quotes_ot ON ot_quotes(ot_source);
```

### MCP Tool Interface

```typescript
// Tool: query_ot_quotes
// Title: Query OT Quotations in NT
// Annotations: readOnlyHint: true, idempotentHint: true

Input:
  book: string     // required — NT book name
  range?: string   // optional — "8:28-8:39" chapter:verse range
  ot_book?: string // optional — filter by OT source book

Output:
  {
    book: string,
    range?: string,
    quotes: [{
      nt_ref: string,      // "Rom 8:36"
      greek_text: string,  // quoted Greek
      ot_source: string    // "Ps 44:22"
    }],
    summary: { total: number }
  }
```

### Server Implementation

New file: `server/src/tools/ot-quotes.ts` following same pattern as existing tools (Zod input/output schemas, D1 query, book name normalization via `resolveBook()`).

Register in `server/src/index.ts` with `server.registerTool('query_ot_quotes', ...)`.

### Skill Updates

- `exegetical-notes/SKILL.md`: Add `query_ot_quotes` to `allowed-tools` frontmatter. Replace "OT_quotes.json for NT passages" reference in Section 8 template with MCP tool call pattern.
- `consult-biblical-scholar/SKILL.md`: Add `query_ot_quotes` to `allowed-tools` frontmatter. Add to CROSS-REFERENCE mode tool table.

---

## Q2: Expand Semantic Groups to 69

### Problem

13 semantic groups cover major soteriological/ethical categories but miss genre-specific vocabulary families critical for epistle analysis (humility, flesh, law, freedom), Hebrew poetry (refuge, lament, praise, enemies), wisdom (folly, vanity, fear-of-the-lord), prophetic (remnant, idolatry, restoration), and apocalyptic (throne, victory, beasts).

### Solution

Add 56 new groups with genre tagging. Full list below.

### Format Change

Add `primary_genres` field to each group for consumer filtering:

```yaml
flesh:
  description: "Flesh/spirit antithesis — σάρξ as power-domain, not merely physical body"
  primary_genres: [epistle]
  nt_lemmas:
    σάρξ: flesh
    σαρκικός: fleshly, carnal
    σαρκίνος: made of flesh
  ot_strongs:
    H1320:
      hebrew: בָּשָׂר
      gloss: flesh
```

Existing 13 groups get `primary_genres` added retroactively.

### Changes Required

1. **`semantic_groups.yaml`** — append 56 new groups with Greek/Hebrew terms and `primary_genres`
2. **`thematic_keywords` D1 table** — new seed SQL file with INSERT statements for all new theme→lemma mappings
3. **`list_books` tool** — already returns themes; will automatically pick up new groups from D1
4. **`metadata` block in YAML** — update `semantic_groups_count: 69`

### Complete Group List (69 total)

#### Existing (13) — add `primary_genres` retroactively

| Key | Primary Genres |
|-----|---------------|
| joy | epistle, hebrew_poetry |
| faith | epistle, ot_narrative |
| love | epistle, hebrew_poetry, gospel_narrative |
| righteousness | epistle, prophetic |
| covenant | ot_narrative, prophetic |
| glory | hebrew_poetry, epistle |
| salvation | epistle, prophetic |
| holiness | epistle, prophetic |
| spirit | epistle, prophetic |
| wisdom | wisdom, epistle |
| peace | epistle, prophetic |
| grace | epistle |
| truth | epistle, wisdom |

#### New — Proposed Original 8

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| suffering | πάσχω, θλῖψις, παθήματα / עֳנִי, צָרָה | epistle, hebrew_poetry |
| kingdom | βασιλεία, βασιλεύω / מֶלֶךְ, מַלְכוּת | gospel_narrative, prophetic |
| death-life | θάνατος, ζωή, ἀνάστασις / מָוֶת, חַי | epistle, wisdom |
| sin | ἁμαρτία, παράβασις / חַטָּאת, עָוֹן, פֶּשַׁע | epistle, prophetic |
| redemption | λύτρον, ἀπολύτρωσις / גָּאַל, פָּדָה, כָּפַר | epistle, prophetic |
| judgment | κρίσις, κρίνω, ὀργή / שָׁפַט, מִשְׁפָּט | prophetic, apocalyptic |
| worship | προσκυνέω, λατρεύω / שָׁחָה, עָבַד | hebrew_poetry, apocalyptic |
| creation | κτίσις, κτίζω / בָּרָא, יָצַר, עָשָׂה | wisdom, epistle |

#### New — Pauline Epistles (8)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| flesh | σάρξ, σαρκικός, σῶμα / בָּשָׂר | epistle |
| reconciliation | καταλλάσσω, καταλλαγή, ἱλασμός / כָּפַר, סָלַח | epistle |
| body-church | σῶμα, μέλος, κεφαλή, κοινωνία, ἐκκλησία / קָהָל, עֵדָה | epistle |
| adoption | υἱοθεσία, κληρονομία, κληρονόμος / נַחֲלָה, יָרַשׁ, בְּכוֹר | epistle |
| hope | ἐλπίς, ἐλπίζω, ἀπεκδέχομαι, παρουσία / תִּקְוָה, קָוָה | epistle |
| conscience | συνείδησις, καρδία, νοῦς, φρόνημα / לֵב, לֵבָב | epistle |
| law | νόμος, ἐντολή, ἔργα νόμου / תּוֹרָה, מִצְוָה, חֹק | epistle, wisdom |
| freedom | ἐλευθερία, ἐλεύθερος, δοῦλος / חָפְשִׁי, דְּרוֹר, עֶבֶד | epistle |

#### New — General Epistles (6)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| priesthood-sacrifice | ἱερεύς, ἀρχιερεύς, θυσία, αἷμα / כֹּהֵן, זֶבַח, עֹלָה | epistle, torah_law |
| testing | πειρασμός, δοκίμιον, ὑπομονή / נָסָה, בָּחַן, צָרַף | epistle |
| confession-witness | ὁμολογέω, μαρτυρέω, μαρτυρία / יָדָה, עֵד | epistle, gospel_narrative |
| perfection | τέλειος, τελειόω, τέλος / תָּמִים, שָׁלֵם | epistle |
| purification | καθαρίζω, καθαρός, ῥαντίζω / טָהֵר, כָּבַס | epistle, torah_law |
| deception | πλανάω, πλάνη, ψευδοδιδάσκαλος / תָּעָה, שָׁגָה | epistle, prophetic |

#### New — Gospels (6)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| discipleship | μαθητής, ἀκολουθέω, διδάσκαλος / לָמַד | gospel_narrative |
| repentance | μετάνοια, μετανοέω, ἐπιστρέφω / שׁוּב, נָחַם | gospel_narrative, prophetic |
| authority-power | ἐξουσία, δύναμις, ἐνέργεια, κράτος / כֹּחַ, גְּבוּרָה | gospel_narrative, epistle |
| parable-mystery | παραβολή, μυστήριον, ἀποκαλύπτω / מָשָׁל, חִידָה, סוֹד | gospel_narrative |
| forgiveness | ἀφίημι, ἄφεσις, χαρίζομαι / נָשָׂא, סָלַח, מָחָה | gospel_narrative |
| obedience | ὑπακούω, ὑπακοή, ἀκούω / שָׁמַע | epistle, gospel_narrative |

#### New — Hebrew Poetry (6)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| refuge | חָסָה, מַחֲסֶה, מִסְגָּב, צוּר, מָגֵן / καταφυγή | hebrew_poetry |
| enemies | אוֹיֵב, צַר, רָשָׁע, חָמָס, שָׂטָן / ἐχθρός | hebrew_poetry |
| lament | קִינָה, בָּכָה, זָעַק, שָׁוַע / θρηνέω, κλαίω, στενάζω | hebrew_poetry |
| praise | הָלַל, יָדָה, זָמַר, שִׁיר, רָנַן / αἰνέω, ψάλλω | hebrew_poetry |
| desire | דּוֹד, אַהֲבָה, חָשַׁק, כָּלָה, יָפָה | hebrew_poetry |
| steadfastness | חֶסֶד + אֱמוּנָה + אֶמֶת paired / ἔλεος, πιστός | hebrew_poetry, ot_narrative |

#### New — Wisdom Literature (5)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| folly | כְּסִיל, אֱוִיל, נָבָל, פֶּתִי, לֵץ / μωρός, ἄφρων | wisdom |
| vanity | הֶבֶל, רְעוּת רוּחַ, עָמָל, יִתְרוֹן | wisdom |
| counsel | עֵצָה, יָעַץ, מוּסָר, תּוֹכֵחָה / νουθεσία, παιδεία | wisdom |
| fear-of-the-lord | יָרֵא, יִרְאָה, מוֹרָא / φόβος, εὐλάβεια | wisdom, hebrew_poetry |
| retribution | שָׁלַם, גְּמוּל, שָׂכָר, פְּרִי / μισθός | wisdom |

#### New — Prophetic (6)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| remnant | שְׁאֵרִית, שְׁאָר, שָׁרִיד, פָּלִיט / λεῖμμα | prophetic |
| idolatry | פֶּסֶל, מַסֵּכָה, גִּלּוּלִים, תּוֹעֵבָה / εἴδωλον | prophetic, ot_narrative |
| oracle | מַשָּׂא, נְאֻם, כֹּה אָמַר, הוֹי / χρηματισμός | prophetic |
| return-restoration | שׁוּב (Hiphil), שְׁבוּת, קָבַץ / ἀποκαθίστημι | prophetic |
| messenger-servant | מַלְאָךְ, עֶבֶד יהוה, נָבִיא, מָשִׁיחַ / ἄγγελος, ἀπόστολος, παῖς | prophetic, gospel_narrative |
| zion | צִיּוֹן, יְרוּשָׁלַיִם, הַר קֹדֶשׁ, הֵיכָל / Σιών, ναός | prophetic, hebrew_poetry |

#### New — OT Narrative (5)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| blessing-cursing | בְּרָכָה, בָּרַךְ, קְלָלָה, אָרַר, חֵרֶם / εὐλογία, κατάρα | ot_narrative |
| election | בָּחַר, בָּחִיר, סְגֻלָּה / ἐκλέγομαι, ἐκλεκτός | ot_narrative, epistle |
| oath-promise | שְׁבוּעָה, שָׁבַע, נָדַר / ὅρκος, ἐπαγγελία | ot_narrative |
| land | אֶרֶץ, אֲדָמָה, נַחֲלָה, יָרַשׁ, גְּבוּל | ot_narrative |
| name | שֵׁם, קָרָא בְשֵׁם, יהוה / ὄνομα | ot_narrative |

#### New — Apocalyptic (6)

| Key | Description | Primary Genres |
|-----|-------------|---------------|
| throne | θρόνος, κάθημαι / כִּסֵּא | apocalyptic, hebrew_poetry |
| victory | νικάω, νίκη, νικητής | apocalyptic |
| seal | σφραγίς, σφραγίζω, βιβλίον / חָתַם | apocalyptic |
| beasts | θηρίον, δράκων, ὄφις / תַּנִּין, לִוְיָתָן | apocalyptic, prophetic |
| time-urgency | καιρός, ἐγγύς, ταχύ, ἔρχομαι / עֵת, קֵץ, מוֹעֵד | apocalyptic |
| new-renewal | καινός, καινότης, παλιγγενεσία / חָדָשׁ | apocalyptic, prophetic |

---

## Q5: Conjunction Querying Pattern for Epistles

### Problem

`exegetical-notes` has morphology querying but doesn't document a specific pattern for extracting logical connectives in epistles. The data is available via `query_morphology` with `pos_filter: "conjunction"`, but no skill tells agents to do this.

### Solution

Add a genre-specific sub-step to `exegetical-notes/SKILL.md` workflow step 3 and a failure pattern entry.

### Changes

**In Workflow section (step 3, "Gather data"), add after the NT block:**

```markdown
### Epistle-Specific: Logical Connective Query

When genre is `epistle`, add to step 3:

Call `query_morphology` with `pos_filter: "conjunction"` for the full passage range.
Identify logical connectives and their discourse function:

| Connective | Greek | Function |
|------------|-------|----------|
| γάρ        | gar   | Grounds/reason ("for") |
| οὖν        | oun   | Inference ("therefore") |
| δέ         | de    | Contrast or continuation ("but/and") |
| ἀλλά       | alla  | Strong contrast ("but rather") |
| ἵνα        | hina  | Purpose ("in order that") |
| ὥστε       | hōste | Result ("so that") |
| εἰ         | ei    | Condition ("if") |
| διότι      | dioti | Causal ("because") |
| ὅτι        | hoti  | Content/causal ("that/because") |

Use these in Section 2 (Internal Structure) to map the argument's logical flow.
```

**In Common Failure Patterns table, add:**

```markdown
| No logical connectives in epistle analysis | For epistles: query_morphology pos_filter "conjunction", map γάρ/οὖν/δέ/ἀλλά/ἵνα flow |
```

### No TDD Required

This clarifies existing instructions (documenting an already-possible query pattern), does not change skill behavior or add new constraints.

---

## S2: `argument-flow` Skill

### Purpose

Standalone analytical tool for mapping clause-level logical flow in epistolary passages. Produces structured proposition diagrams showing main claims, grounds, inferences, conditions, purposes, and subordination.

Like exegetical-notes but focused on a single dimension: the argument's logical architecture.

### Invocation

```
/argument-flow Romans 8:28-39
/argument-flow Galatians 3:1-14
/argument-flow Hebrews 1:1-4
```

Saves output to `~/.claude/argument-flow/{book}/{YYYY-MM-DD}-{range}.md`.

### Iron Rules

1. **Pericope check first** — same pattern as exegetical-notes. Argument flow on a partial unit is worse than no argument flow.
2. **MCP before prose** — call `query_morphology` (conjunction filter + full parse) and `query_discourse_features` before composing any structure.
3. **Every connective cited from data** — no "Paul argues that..." without citing the specific γάρ/οὖν/ἵνα and its verse. Format: `γάρ (8:28) → grounds for...`
4. **Genre gate** — if book genre is not `epistle`, warn and suggest `exegetical-notes` or (future) `poetic-analysis`. Proceed only on user confirmation.
5. **Save to file** — `~/.claude/argument-flow/{book}/{YYYY-MM-DD}-{range}.md`

### Allowed Tools

```yaml
allowed-tools: Read, Write, Glob, WebSearch, Bash,
  mcp__claude-of-alexandria-mcp__query_discourse_features,
  mcp__claude-of-alexandria-mcp__query_paragraph_breaks,
  mcp__claude-of-alexandria-mcp__query_vocabulary,
  mcp__claude-of-alexandria-mcp__query_morphology,
  mcp__claude-of-alexandria-mcp__query_ot_quotes
```

### Workflow

```
1. Parse book + range
2. Pericope check (lightweight — same as exegetical-notes)
3. Genre check — if not epistle, warn and await confirmation
4. Query MCP:
   a. query_morphology: full range (all words — clause structure)
   b. query_morphology: pos_filter "conjunction" (logical connectives)
   c. query_discourse_features: discourse markers for the book
   d. query_vocabulary: key terms for proposition labeling
   e. query_ot_quotes: OT quotations in range (for embedded quotes)
5. Build connective inventory (table of every conjunction with function)
6. Identify propositions (main clauses vs. subordinate)
7. Map connective logic (γάρ → grounds, οὖν → inference, etc.)
8. Handle special patterns:
   - Asyndeton (missing connective = deliberate rhetorical device)
   - Sorites chains (Rom 8:29-30: linked propositions without connectives)
   - Rhetorical questions (treat as propositions with implied answers)
   - Embedded OT quotations (mark as external evidence, cite source)
9. Generate structured output
10. Save to file, report path
```

### Output Format

```markdown
# Argument Flow: [Book] [Range]

**Generated:** [YYYY-MM-DD]
**Passage:** [Book Chapter:Verse-Chapter:Verse]
**Genre:** epistle
**Pericope Status:** [Valid unit | Extended | Confirmed problematic]

---

## Connective Inventory

| Verse | Connective | Lemma | Function |
|-------|-----------|-------|----------|
| 8:28  | —         | —     | Main assertion (no connective) |
| 8:29  | ὅτι       | ὅτι   | Causal ground |
| 8:30  | —         | —     | Asyndeton (sorites chain) |
| 8:31  | οὖν       | οὖν   | Inference |
| 8:31  | εἰ        | εἰ    | First-class condition |
| ...   | ...       | ...   | ... |

[Source: query_morphology pos_filter "conjunction"]

## Proposition Map

### Main Claim (vv. 28)
> God works all things together for good for those who love him

  ├── GROUND (v. 29): ὅτι — "because he foreknew..."
  │   ├── CHAIN (v. 29b): καί — "he also predestined..."
  │   ├── CHAIN (v. 30a): — [asyndeton/sorites] "he called..."
  │   ├── CHAIN (v. 30b): — "he justified..."
  │   └── CHAIN (v. 30c): — "he glorified..."
  │
  ├── INFERENCE (v. 31): οὖν — "What then shall we say?"
  │   ├── CONDITION (v. 31b): εἰ — "If God is for us..."
  │   └── RHETORICAL Q: "who can be against us?"
  │
  ├── EVIDENCE (v. 32): — [a fortiori argument]
  │   └── RHETORICAL Q: "How will he not also...give us all things?"
  │
  ├── RHETORICAL Q (v. 33): — "Who will bring charge?"
  │
  ├── RHETORICAL Q (v. 34): — "Who is the one who condemns?"
  │   └── GROUNDS: "Christ Jesus...who intercedes"
  │
  ├── RHETORICAL Q (v. 35): — "Who will separate us?"
  │
  ├── OT EVIDENCE (v. 36): ὅτι — quoting Ps 44:22 [query_ot_quotes]
  │
  └── CONCLUSION (vv. 37-39): ἀλλά — "in all these things we overwhelmingly conquer"
      ├── GROUND (v. 38): γάρ — "I am convinced..."
      └── SCOPE: "neither death nor life...shall separate us"

## Argument Summary

[2-3 sentences: the passage's logical arc from premise to conclusion]
[Identify the argument type: deductive chain, a fortiori, sorites, etc.]

## Discourse Features

[Levinsohn features found in this range]
[Interpretive significance for argument structure]

## Data Sources

- MorphGNT/SBLGNT via query_morphology [query_morphology]
- Levinsohn GNT Discourse Features via query_discourse_features [query_discourse_features]
- OT quotation data via query_ot_quotes [query_ot_quotes]
- [Any Tier 3 scholarly sources from web search]
```

### Connective Function Reference

Embedded in the skill for agent use:

| Connective | Lemma | Primary Function | Secondary |
|-----------|-------|-----------------|-----------|
| γάρ | gar | Grounds/explanation | Confirmation |
| οὖν | oun | Inference/conclusion | Resumption |
| δέ | de | Development/contrast | Continuation |
| ἀλλά | alla | Strong adversative | Correction |
| ἵνα | hina | Purpose | Result (rare) |
| ὥστε | hōste | Result | — |
| εἰ | ei | Condition (protasis) | — |
| ἐάν | ean | Condition (uncertain) | — |
| διότι | dioti | Causal ("because") | — |
| ὅτι | hoti | Content/causal | Quotation marker |
| καί | kai | Addition/sequence | Explicative ("namely") |
| μέν...δέ | men...de | Contrast pair | — |
| ἤ | ē | Disjunction ("or") | — |
| τε | te | Close connection | — |
| διό | dio | Strong inference ("therefore") | — |
| ἄρα | ara | Inferential ("so then") | — |

### Special Patterns

**Asyndeton (no connective):**
- Common in sorites chains (Rom 8:29-30), vice/virtue lists, hymnic fragments
- Mark as deliberate rhetorical device, not missing data
- Notation: `— [asyndeton: sorites chain]` or `— [asyndeton: climactic]`

**Rhetorical questions:**
- Treat as propositions with implied answers
- Indicate whether answer is "yes" (expects affirmative) or "no" (expects negative)
- Greek clue: μή expects "no"; οὐ expects "yes"
- Notation: `RHETORICAL Q (expects: no): "Who will separate us?"`

**Embedded OT quotations:**
- Mark source from `query_ot_quotes`
- Function label: `OT EVIDENCE` or `OT GROUND`
- Note whether quotation serves as premise, warrant, or illustration

**Hymnic/confessional fragments:**
- Phil 2:6-11, Col 1:15-20, 1 Tim 3:16
- Mark as `EMBEDDED HYMN` — analyze internal logic separately
- Note where the hymn sits in the surrounding argument

### What This Skill Does NOT Do

- Does not produce full 10-section exegetical notes (use `exegetical-notes`)
- Does not handle Hebrew poetry (future `poetic-analysis` skill)
- Does not do word studies beyond proposition labeling
- Does not produce application or devotional content

### TDD Requirements

Per CLAUDE.md, this skill requires the full RED-GREEN-REFACTOR cycle:

**Test scenarios to design (in `tests/skills/argument-flow/scenarios.md`):**
1. Standard epistle passage with clear connective chain (Rom 8:28-39)
2. Passage with asyndeton / sorites (Rom 8:29-30)
3. Passage with rhetorical questions (Rom 8:31-35)
4. Non-epistle passage — should warn and suggest alternatives
5. Embedded OT quotation within argument (Rom 8:36)
6. Passage with hymnic fragment (Phil 2:1-11)
7. Passage where conjunctions have secondary functions (ὅτι as content vs. causal)
8. User insists on non-epistle genre — should proceed with warning

---

## Implementation Order

```
1. Q2: Semantic groups expansion (YAML + D1 seed)
   — No dependencies, enables better vocabulary queries immediately

2. Q1: query_ot_quotes MCP tool
   a. Write merge script (Python)
   b. Download + merge datasets
   c. Generate d1-seed/ot-quotes.sql
   d. Add D1 schema
   e. Implement server/src/tools/ot-quotes.ts
   f. Register in index.ts
   g. Update skill allowed-tools
   h. Deploy

3. Q5: Conjunction pattern in exegetical-notes
   — Small doc change, no dependencies

4. S2: argument-flow skill (TDD cycle)
   a. Write test scenarios
   b. Run baseline (RED phase)
   c. Write skill (GREEN phase)
   d. Refactor (close loopholes)
   — Depends on Q1 (uses query_ot_quotes) and Q5 (conjunction reference)
```

---

## Files Changed

| File | Change |
|------|--------|
| `plugins/.../reference/vocabulary/semantic_groups.yaml` | Expand from 13 to 69 groups with genre tags |
| `server/d1-seed/schema.sql` | Add `ot_quotes` table |
| `server/d1-seed/ot-quotes.sql` | New — seed data from merged Levinsohn + STEPBible |
| `server/d1-seed/thematic-keywords-expansion.sql` | New — INSERT statements for 56 new theme groups |
| `server/src/tools/ot-quotes.ts` | New — query tool implementation |
| `server/src/index.ts` | Register `query_ot_quotes` tool |
| `plugins/.../skills/exegetical-notes/SKILL.md` | Add conjunction pattern + `query_ot_quotes` to allowed-tools |
| `plugins/.../skills/consult-biblical-scholar/SKILL.md` | Add `query_ot_quotes` to allowed-tools |
| `plugins/.../skills/argument-flow/SKILL.md` | New — full skill file |
| `plugins/.../skills/argument-flow/README.md` | New — development notes |
| `tests/skills/argument-flow/scenarios.md` | New — test scenarios |
| `tests/skills/argument-flow/baseline.md` | New — RED phase evidence |
| `tests/skills/argument-flow/verification.md` | New — GREEN phase proof |
| `plugins/.../.claude-plugin/plugin.json` | Add argument-flow to skills array |
