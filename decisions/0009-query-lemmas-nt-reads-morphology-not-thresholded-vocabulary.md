---
id: "0009"
status: accepted
scope:
  - server
  - plugin
topic: etl
affects:
  - server/src/tools/lemmas.ts
  - plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_nt_vocabulary.py
  - plugins/claude-of-alexandria/skills/biblical-segmentation/scripts/extract_ot_vocabulary.py
decided: 2026-07-18
last-verified: 2026-07-18
decided-by: human
decided-in: interactive
model: null
source: null
source-session: null
supersedes: null
depends-on:
  - "0008"
rejected-approaches:
  - repoint-ot-query_lemmas-to-morphology-strongs
  - document-the-threshold-instead-of-fixing-it
prov-inputs: []
prov-activity: null
delegated-by: null
---

# query_lemmas NT distribution reads morphology, not the thresholded vocabulary table
## Context
query_lemmas is documented as reporting a lemma's exact cross-book distribution. It read the precomputed `vocabulary` table, which is built PER BOOK by extract_nt_vocabulary.py / extract_ot_vocabulary.py with a `min_occurrences` significance filter (NT default 3, OT default 5). That filter silently drops any lemma occurring below the threshold within a given book. Consequence: μεταξύ (G3342, adverb) occurs once in John 4:31, so it was dropped from John (and Matthew, Luke, Romans, each <3 in-book) and survived only in Acts (3 in-book) — the tool reported "μεταξύ 0× in John" while the `morphology` table (word-level ground truth, exposed by query_morphology) correctly carried it. The same defect drops H7225 (רֵאשִׁית) in Genesis on the OT side. This is a silent correctness failure for word-distribution study.
## Decision
Split the fix by testament. (1) NT: query_lemmas now computes the distribution from the complete `morphology` table (`SELECT lemma, book, chapter, COUNT(*) ... GROUP BY lemma, book, chapter`, testament='nt'). NT lemma keys are Greek lexical forms that match morphology.lemma byte-for-byte and match query_morphology's own output — the documented source of these keys — so there is no reconciliation to do and the fix ships in code with no data regeneration. (2) OT: query_lemmas keeps reading `vocabulary`; OT completeness is delivered by lowering the extractor `min_occurrences` default to 1 (both testaments) and regenerating/reseeding the vocabulary table. The same reseed makes query_vocabulary complete for both testaments.
## Rationale
The OT path cannot be repointed to morphology.strongs the way NT was: per 0008, the vocabulary/lemmas tools key OT lemmas in the morphhb/WLC namespace (unpadded, sense-suffixed — "H430", "H7225", "H1121a"), whereas morphology.strongs is MACULA's namespace (zero-padded, sense-suffixed — "H0430", "H1886a"). Matching input keys against morphology.strongs would require a padding + base/augmented-sense reconciliation layer — exactly the effort 0007/0008 scoped — and doing it hastily risks regressing OT lookups. Routing OT completeness through the ETL threshold instead keeps OT on its existing, format-compatible namespace and fixes query_vocabulary in the same pass. morphology is also the correct source-of-truth for an exhaustive distribution tool: it is unfiltered, and it makes query_lemmas consistent with the query_morphology → query_lemmas workflow the tool docs prescribe.
## Rejected Alternatives
- repoint OT query_lemmas to morphology.strongs — namespace mismatch (0008); needs the padding/sense reconciliation layer; deferred, not bundled into a bug fix.
- document the threshold instead of fixing it — leaves the tool silently under-reporting with a confident, complete-looking total_occurrences; unacceptable for word-study with theological stakes.
## Follow-up (not yet done)
The NT code fix is live. query_vocabulary and the OT query_lemmas path remain under-reporting until the `vocabulary` table is regenerated with min_occurrences=1 and applied to prod. server/scripts/generate-vocabulary-sql.py converts the extractor JSONs directly into idempotent per-book vocabulary SQL (removing the dependency on the now-absent sibling biblical.sqlite that export-d1.ts read), and server/scripts/REGENERATE-VOCABULARY.md is the maintainer runbook. The apply step is a destructive full-table replace on production D1; per decision 0004 that would run with no human in the loop, so the automating workflow is proposed in the runbook but intentionally left for the maintainer to review and commit rather than stood up here. The committed reference JSONs still carry the old thresholds until a regeneration runs, and note the clobber caveat: a seed-d1.sh reseed re-applies the stale data.sql vocabulary and silently reverts the regeneration.
