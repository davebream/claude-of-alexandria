---
id: "0007"
status: accepted
scope:
  - server
topic: etl
affects:
  - server/scripts/**
  - server/src/tools/**
  - server/migrations/**
  - .github/workflows/**
decided: 2026-07-18
last-verified: 2026-07-18
decided-by: agent:builder
decided-in: build
model: null
source: .kombajn/plans/2026-07-17-hebrew-lemma-translit-derived-design.md
source-session: null
supersedes: "0002"
depends-on:
  - "0003"
  - "0006"
rejected-approaches:
  - consumer-base-fallback-for-sense-suffixes
  - per-value-derived-provenance-marker
  - runtime-transliterate-in-worker
---

**Refines 0002 (which is now superseded).** Hebrew `lemma_translit` is no longer always null: it is DERIVED by rendering the stored pointed lemma to SBL Academic via `hebrew-transliteration@2.11.0` (schema `sblAcademicSpirantization`, MIT), NFC-normalized, then applied by the guarded local lemma-translit operator command into two D1 lookup tables (`lemma_translit_he` keyed by pointed lemma for `query_morphology`; `lemma_translit_he_strongs` keyed by Strong's number for the vocabulary/lemmas/theme tools).

**Why this does not violate 0002's principle.** 0002 rejected romanization *by character mapping* — which genuinely cannot resolve vocal-vs-silent shewa, dagesh forte/lene (U+05BC), or qamets/qamets-qatan (U+05B8). `havarotjs` (the library's engine) does *syllabification-aware* rendering under Khan's Tiberian tradition — the same class of resolution 0002 credited to MACULA's linguists, not naive mapping. 0002's core guarantee is preserved: an **unpointed lemma is never guessed** — a niqqud-presence predicate (≥1 of U+05B0–U+05BC, U+05C7) excludes consonantal skeletons (201 lemmas on current data), which stay null.

**Provenance (AC-3) is declarative, not per-value.** Derived-vs-source is fully determined by testament (Hebrew=derived, Greek=source-read from OpenGNT); stated in each tool's `lemma_translit` `.describe()` and here. No per-row marker — a product decision, not a doc-placement one.

**Key mechanics.** The strongs table carries dual-form keys — padded (`H0001`, morphology's format) AND unpadded (`H1`, the consumer tables' format) plus base (suffix-stripped) — because those two data sources spell Strong's differently; a coverage gate (below) empirically guards this. Tie-break for multi-lemma strongs: highest occurrence count, then smallest lemma UTF-8 byte sequence. A base key that is *itself* independently attested keeps its own attestation, not the homograph family's representative.

**Known coverage boundary (honest null).** ~165 consumer OT strongs get null `lemma_translit`: 11 whose only lemma is unpointed, and 154 sense-suffixed (e.g. `H1004b`) or Aramaic senses that MACULA does not attest at all. Consumer base-fallback (serving `H1004`'s value for `H1004b`) was rejected — it would guess a possibly-different homograph. Consequence: the same Strong's surfaced via `query_morphology` (exact pointed lemma) vs the vocabulary family (representative) can legitimately differ for homographs.

**Fixture caveat.** The pinned test fixture certifies *observed library output* (a drift alarm), not independently *certified SBL correctness*; library sub-variant conventions (e.g. `î` vs MACULA's `iy`; macron-`ī` for closed-syllable hireq) are accepted as-observed and may diverge from `text_translit` in one response.

**SQL discipline.** DELETE-then-INSERT into the two derived sibling tables (0003's morphology update-only rule does not apply to them). No `BEGIN/COMMIT` emitted, per 0006. An attestation-aware blocking coverage gate in the backfill workflow is the authoritative guard: it blocks only when a strongs that HAS a pointed lemma is missing a table row (a real dropped-spelling bug), never on the honest-null boundary above.
