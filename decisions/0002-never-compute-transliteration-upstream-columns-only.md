---
id: "0002"
status: superseded
superseded-by: "0007"
scope:
  - server
topic: etl
affects:
  - server/scripts/**
  - server/src/tools/**
decided: 2026-07-17
last-verified: 2026-07-17
decided-by: agent:designer
decided-in: extraction
model: null
source: .kombajn/plans/2026-07-17-mcp-extract-upstream-sbl-transliteration-design.md
source-session: T1
supersedes: null
depends-on: []
rejected-approaches:
  - runtime-transliterate-helper
  - computed-fallback-for-OT-gap
  - lexicon_bdb-for-hebrew
prov-inputs: []
prov-activity: null
delegated-by: null
---

> **Superseded by [0007].** The "always null" conclusion below was refined once a syllabification-aware renderer (not the character mapping this decision rejected) made deriving Hebrew `lemma_translit` from the *fully pointed* lemma safe. The surviving core — **an unpointed form is never guessed** — is preserved by 0007. See 0007 for the current behavior.

Romanization is read from upstream only — OpenGNT `cols[9]` subfield 0 (`transSBLcap`, 100% of 138,013 NT rows) and MACULA index 4 (79.63% of 475,911 OT rows). Absent values are NULL, NEVER a guess.

SBL Academic Hebrew is unreachable by character mapping: vocal vs silent shewa is syllable-positional, dagesh forte and dagesh lene share codepoint U+05BC, and qamets vs qamets-qatan are visually identical. MACULA's linguists already resolved these cases. Computing would mean owning that bug surface permanently and risking two romanizations of one word disagreeing inside a single response.

`lexicon_bdb` is a modern-Israeli pronunciation guide (aleph->av, with syllable dots), not academic romanization — wrong system entirely. Hebrew `lemma_translit` is therefore always null.
