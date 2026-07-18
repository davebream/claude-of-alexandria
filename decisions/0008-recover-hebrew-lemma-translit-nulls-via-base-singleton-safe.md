---
id: "0008"
status: accepted
scope:
  - server
topic: etl
affects:
  - server/scripts/generate-lemma-translit.ts
  - server/scripts/verify-lemma-translit-coverage.mjs
decided: 2026-07-18
last-verified: 2026-07-18
decided-by: human
decided-in: interactive
model: null
source: docs/reviews/2026-07-18-hebrew-lemma-translit-null-recovery.md
source-session: null
supersedes: null
depends-on:
  - "0006"
  - "0007"
rejected-approaches:
  - unconditional-consumer-base-fallback
  - consumer-side-base-strip-at-query-time
  - runtime-transliterate-in-worker
prov-inputs: []
prov-activity: null
delegated-by: null
---

# Recover Hebrew lemma_translit nulls via base-singleton safe-suffix aliases
## Context
The vocabulary/lemmas/themes tools key OT lemmas by sense-suffixed Strong's (e.g. H1121a, from morphhb/WLC via extract_ot_vocabulary.py), but lemma_translit_he_strongs is keyed in MACULA's base-spelling namespace, so the exact-match join returns null even when the base is unambiguous. A live census of all 39 OT books found ~92 distinct surfaced nulls, of which ~57 are recoverable with no guess and ~35 are genuine honest-nulls.
## Decision
In generate-lemma-translit.ts, emit an alias row for a consumer key K = base + sense-suffix (matched by /[a-z]$/) that has no exact row, resolving K to the base's transliteration if and only if the base attests exactly one distinct pointed lemma; homograph (>=2 romanizations), unpointed, or unattested bases stay null. No consumer-code changes; verify-lemma-translit-coverage.mjs reclassifies safe-recoverable keys as a blocking wouldBeBug.
## Rationale
A singleton base has no alternative sense to guess wrong, so 0002/0007's anti-guessing guarantee holds; safety is decided in the generator where the full per-base lemma multiset is visible, never by sampling. It recovers ~57 high-frequency nulls (H1121a->bēn, H1004b->bayīṯ, H834a->ʾăšer) from data already in-corpus, and the value stays precomputed in CI.
## Rejected Alternatives
- unconditional consumer-base-fallback (0007) — guesses among homographs; kept rejected, only narrowed to the proven-singleton case.
- consumer-side base-strip at query time — needs a shipped homograph table and four edited call sites, and cannot see the full per-base multiset.
- runtime-transliterate-in-worker (0007) — kept rejected; keeps values precomputed and stored.
