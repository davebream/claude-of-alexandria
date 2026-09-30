# Commentary source audit

Checked 2026-09-30 for issue #217. The decision applies to the stored corpus, not
to every edition of a historical author's work.

## Publication decision

Seven sources are enabled: the existing six HelloAO-distributed commentaries and
Translation Notes derived from unfoldingWord. All 22 patristic author corpora are
identified but remain unavailable because rights for every imported translation
have not been established. This is an unresolved edition audit, **not a finding
that all patristic material is copyrighted**.

The catalog in `server/src/provenance/commentaries.ts` is the publication switch.
Unknown stored IDs are also excluded explicitly. No stored rows were changed or
deleted by this audit. Raw production text and downloaded corpora are not included
in this change; the protocol fixture uses synthetic text with observed lengths.

## Import lineage and comparison method

The original [patristic importer at b6f2d8b3](https://github.com/davebream/claude-of-alexandria/blob/b6f2d8b3ef1773d39871bc048e7866ba260d3458/server/scripts/etl-patristic.py)
downloaded HistoricalChristianFaith's mutable `latest` SQLite asset, selected 22
authors, decoded chapter/verse positions, omitted noncanonical books, stripped text
and replaced CR/LF with spaces. It discarded source titles, URLs, and the original
row identifiers. Cross-chapter records retained the starting chapter and ending
verse number; this audit does not change that historical transformation.

A read-only D1 query retrieved each selected author's stored `(book, chapter,
verse_start, verse_end, text)` tuples. Each tuple was compared with the same
transformation of the upstream TOML quotes at
[`a69dd35f39b4c965083bedb6cb21a9429f5de9a3`](https://github.com/HistoricalChristianFaith/Commentaries-Database/tree/a69dd35f39b4c965083bedb6cb21a9429f5de9a3).
Every stored tuple has an exact match, including the reference and complete text.
This establishes a matching source snapshot; it **does not prove the exact import
revision**, since identical data can occur in multiple revisions. Matching does
not by itself establish redistribution rights, and is not a claim of identical
upstream row multiplicities or complete upstream coverage.

A comparison with the newer release (release ID `393732029`, published
2026-09-22; SQLite SHA-256
`bc98cc1a57bb00c4f8183d2d14e0d4b6fe5fafab55e99d01146baf9fc9e72349`)
matched only subsets. The older matching snapshot is therefore the evidence for
stored patristic content, rather than an invented current-version attribution.

The [upstream rights declaration pinned at 8e8082b5](https://github.com/HistoricalChristianFaith/Commentaries-Database/blob/8e8082b5f541e7e4105f48692f973956caa72dcd/LICENSE)
dedicates the compilation and public-domain-source excerpts to the public domain,
but explicitly excludes copyrighted excerpts. The [license clarification](https://github.com/HistoricalChristianFaith/Commentaries-Database/issues/10)
confirms addition of that declaration. Neither provides a blanket public-domain
label for every English translation attributed to an ancient author.

## Existing six sources

The repository's `server/scripts/etl-commentaries.py` identifies the distributor
as the [Free Use Bible API (HelloAO)](https://bible.helloao.org/api/available_commentaries.json).
It extracts verse records, recursively flattens content into text, and stores one
row per nonempty verse record. The distributor labels the five historic
commentaries public domain and Tyndale Open Study Notes CC BY-SA 4.0. Existing
public dataset IDs are preserved, and their source URLs now identify the actual
distribution channel. Import revisions remain unknown (`version: null`).

The API corpus fingerprints below were observed on the audit date. They identify
the compared current catalog, **not a proven historical import revision**. API
response hashes pin the exact bytes used for sample comparisons.

| Source | Edition/distribution and rights | Verification | Current API corpus SHA-256 |
| --- | --- | --- | --- |
| `adam-clarke` | Adam Clarke Bible Commentary, HelloAO; Public Domain Mark | Exact sample match: 1_chronicles 1:1 | `92e28c9363c876d215e296f2fe04abb3ab7e34a2aacebdf06bd62ae79c6e3dba` |
| `jamieson-fausset-brown` | Jamieson-Fausset-Brown Bible Commentary, HelloAO; Public Domain Mark | Exact sample match: 1_chronicles 1:4 | `db3d4c8b3c1f32ef9d1430a57392e02bda3a17aac1f9bbe398461de021a3cb13` |
| `john-gill` | John Gill Bible Commentary, HelloAO; Public Domain Mark | Same Gill passage; current cross-reference formatting differs (see below) | `f6fcfd6c3a726dc834cfaf1ae1cd0bf49bffb88c1246ac3500699e8af7be71a5` |
| `keil-delitzsch` | Carl Friedrich Keil and Franz Delitzsch Old Testament Commentary, HelloAO; Public Domain Mark | Exact sample match: 1_chronicles 1:1 | `bb5cc0f9cfe0a93b3c903bb6972c6bc8c4e9f2bd3be6c2a6d276737cf9c5edce` |
| `matthew-henry` | Matthew Henry Bible Commentary, HelloAO; Public Domain Mark | Exact sample match: 1_chronicles 1:1 | `ad2850450a1e5c0546c275f4bd09b9325ae47424d83311120ca7ced5724c4bc8` |
| `tyndale` | Tyndale Open Study Notes, HelloAO; CC BY-SA 4.0 | Exact sample match: 1_chronicles 1:1 | `62fa003ca326f8ab22a04accb2a49d2b5865ce2cecd74284228e1be08edd5e10` |

For Psalm 134, both Keil–Delitzsch rows, the Henry row and the Tyndale row match
exactly. Gill's sampled text differs from the current API in reference expansion,
spacing and a trailing next-chapter navigation line; do not describe it as a
byte-for-byte match. The importer, passage content and distributor identify the
same public-domain Gill commentary. No stored text is rewritten by this fix.
The API does not establish a print-edition year for all five historic sources;
none is invented in the registry.

| Compared API response | SHA-256 of response bytes |
| --- | --- |
| [adam-clarke 1_chronicles 1:1](https://bible.helloao.org/api/c/adam-clarke/1CH/1.json) | `03c2b057205c56e223d8c13f5b1a5cb791b6aa19468fa8aecb09db2b4f3c756b` |
| [jamieson-fausset-brown 1_chronicles 1:4](https://bible.helloao.org/api/c/jamieson-fausset-brown/1CH/1.json) | `7075287f5a9da5fec9022b7eee2331bac441759b5887d8650e06c7b178a5ff76` |
| [john-gill 1_chronicles 1:1](https://bible.helloao.org/api/c/john-gill/1CH/1.json) | `41fc54b61e426a7eebfcbe274dea8d318fcd130c22552f6dafd1fe5474a1b0a2` |
| [keil-delitzsch 1_chronicles 1:1](https://bible.helloao.org/api/c/keil-delitzsch/1CH/1.json) | `47eea9f68b14f3994b5fc8b86299a157d3d653ce88fae550f86f8038bac89d17` |
| [matthew-henry 1_chronicles 1:1](https://bible.helloao.org/api/c/matthew-henry/1CH/1.json) | `8abb156be506529e39467dcb43a88c74e7f3bf47655272c149783f119fe52c61` |
| [tyndale 1_chronicles 1:1](https://bible.helloao.org/api/c/tyndale/1CH/1.json) | `98db03918fe40dc9a3638d35e63d31219df95c0d7a9c811e9a2ce74d5480870c` |

## Translation Notes derived from unfoldingWord

The older data-upgrade branch's `server/scripts/etl-unfoldingword-tn.py` identifies
[unfoldingWord/en_tn](https://git.door43.org/unfoldingWord/en_tn) as its source. It
converts TSV verse references to passage rows, omits introductory rows, decodes
escaped newlines, strips surrounding whitespace and stores Quote/SupportReference
separately. The runtime continues to return the stored note text unchanged.

All five stored Psalm 134 notes match the notes at
[`fb8fa6f7061123bb2ce60bbaf6452ae02db9856a`](https://git.door43.org/unfoldingWord/en_tn/src/commit/fb8fa6f7061123bb2ce60bbaf6452ae02db9856a/tn_PSA.tsv)
after those transformations. The current snapshot at `4cc80ae56db31155f42539107e38d6bcd6c320b1`
does not match these five notes. The matching snapshot is corroboration of the
source; it is not recorded as a proven corpus-wide import revision.

The [license in the matching snapshot](https://git.door43.org/unfoldingWord/en_tn/src/commit/fb8fa6f7061123bb2ce60bbaf6452ae02db9856a/LICENSE.md)
is CC BY-SA 4.0 and supplies derivative-work attribution. The public dataset is
`commentary_unfoldingword`, titled “Translation Notes (derived from unfoldingWord)”.
The response, notices and legal page identify the original source, explain the
formatting/selection changes, and preserve CC BY-SA 4.0. The derivative title does
not use the registered trademark as its product name. `version` remains null.

## Patristic decisions, author by author

All rows in this table are **unresolved and not published**. Each matches the
pinned March source snapshot; the remaining gap concerns the imported English
editions and their rights. Source titles below are evidence identifiers, not
quotations from the commentary text. A known source URL is not treated as a reuse
grant. Do not substitute the public-domain status of the author's original work
for the status of an unidentified translation.

| Stored ID | Stored rows / exact matches | Edition evidence and unresolved gap |
| --- | ---: | --- |
| `ambrose-of-milan` | 1843 / 1843 | Includes *On Theodosius*, letters and other excerpts without identified translation editions; the Psalm 134 match alone does not clear the complete author corpus. |
| `ambrosiaster` | 1043 / 1043 | Includes hundreds of *Commentary on Paul’s Epistles* excerpts without edition URLs, plus a Google Books record; no corpus-wide redistribution grant established. |
| `augustine-of-hippo` | 7528 / 7528 | Includes *Admonition and Grace*, *Predestination of the Saints* and other excerpts without identified translation editions; the Psalm 134 match alone does not clear the complete author corpus. |
| `basil-of-caesarea` | 690 / 690 | Includes *The Long Rules*, *Concerning Baptism* and homilies without identified translation editions. |
| `bede` | 6271 / 6271 | Includes *The Reckoning of Time* excerpts without identified editions; the historicalchristian.faith links do not establish rights for every translation. |
| `clement-of-alexandria` | 904 / 904 | Two matched *Excerpts from Theodotus* rows point to gnosis.org/library/excr.htm; the translator, edition and reuse grant were not established. A source URL alone is not rights evidence. |
| `cyprian` | 885 / 885 | Nine matched rows lack both source title and URL; translation edition cannot be assigned. |
| `cyril-of-alexandria` | 2177 / 2177 | Includes letters and other excerpts without identified translation editions. |
| `ephrem-the-syrian` | 764 / 764 | Includes *Hymns on Paradise* and many source-less excerpts; translation editions not established. |
| `eusebius-of-caesarea` | 393 / 393 | Includes *Proof of the Gospel* and other excerpts without source URLs; complete edition coverage not established. |
| `gregory-the-dialogist` | 3101 / 3101 | Three matched *Morals on Job* excerpts lack source URLs; the corpus also includes *Forty Gospel Homilies*. Translation editions are not established for the complete corpus. |
| `hilary-of-poitiers` | 624 / 624 | Includes *On the Trinity* and source-less excerpts; complete edition coverage not established. |
| `hippolytus-of-rome` | 494 / 494 | Matched *Fragment on Proverbs* and other excerpts have no source URL or identified translation edition. |
| `irenaeus` | 717 / 717 | Four matched rows have no source URL, including *Proof of the Apostolic Preaching* 71 and 38–39; translation edition not identified. |
| `jerome` | 5299 / 5299 | Includes *Homilies on the Psalms* and other homilies without identified translation editions. |
| `john-chrysostom` | 7355 / 7355 | Includes *Baptismal Instructions* and *Homilies on Genesis* excerpts without identified translation editions. |
| `oecumenius` | 987 / 987 | Includes *Pauline Commentary from the Greek Church* and source-less excerpts; a linked Latin edition does not establish the rights of an English translation. |
| `origen-of-alexandria` | 2652 / 2652 | Includes *Commentary on the Song of Songs*, Google Books-linked material and source-less excerpts; complete translation rights not established. |
| `tertullian` | 3450 / 3450 | Twenty-two matched rows lack both source title and URL; translation edition cannot be assigned. |
| `theodore-of-mopsuestia` | 491 / 491 | All matched source records lack URLs, including *Pauline Commentary from the Greek Church*; translation editions not established. |
| `theodoret-of-cyrus` | 1374 / 1374 | Includes *Questions on Chronicles* and other excerpts without identified translation editions. |
| `theophylact-of-ohrid` | 1275 / 1275 | Includes epistle commentaries without source URLs plus archived and Google Books-linked material; complete edition rights not established. |

To enable an unresolved author, establish the translation edition and applicable
rights for every stored row, document the evidence, and then add its dataset
mapping. Replacing the corpus or publishing only selected rows would require a
separate, explicit data change; neither is performed here.

## Psalm 134 regression and response semantics

The observed query contained 16 rows: Ambrose 1, Augustine 3, Gill 3,
Keil–Delitzsch 2, Henry 1, Tyndale 1, and unfoldingWord 5. With these publication
decisions the response contains 12 publishable entries and reports four excluded
entries across two sources. Duplicate verse rows remain distinct.

`unavailable_sources` repeats the matching source IDs, reasons and omitted-entry
counts on every page. `page.total` counts publishable matching entries, not
excluded rows. Following every cursor exhausts the available rows but does not
resolve source gaps. All-excluded matches and named unresolved sources return
`SOURCE_UNAVAILABLE`; database failures remain errors. A successful empty query
is not evidence that scholars never discussed the passage.

Provenance is computed for the records on each page, inside the response-size
calculation. Successful empty results retain the provenance of the verified
sources queried. Cache namespace `v10` separates this output from prior cached
responses and cursors; deployments with an explicit `CACHE_VERSION` override
must advance that override too.

## Release verification

The fixture reproduces production row identities, verse spans, duplicate positions
and text lengths using synthetic placeholders, without redistributing unresolved
translations. Protocol tests cover all 29 named IDs, output-schema validation,
source coverage, errors, empty results, and size-limited cursor traversal.

After the PR is merged and the normal Worker deployment succeeds, call
`commentary_lookup` for `Psalms`, `134:1-134:3`, `page_size: 100`; expect 12
publishable entries over all returned pages and four reported omissions. Repeat
with `page_size: 2` and follow all cursors. Named Gill and Keil–Delitzsch requests
must still return three and two entries respectively. This release intentionally
requires manual merge; these production checks must not be claimed before deploy.
