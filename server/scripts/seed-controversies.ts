/**
 * seed-controversies.ts
 * ETL script: transforms the curated CONTROVERSY_DATASET into SQL INSERT statements
 * for D1 ingestion into the controversy_topics and controversy_passages tables.
 *
 * Usage:
 *   cd server && npx tsx scripts/seed-controversies.ts --output migrations/0018_seed_controversies.sql
 *
 * Source: Curated in-house — no external fetch (OR-5).
 */

import { writeFileSync } from 'fs';
import {
  slugify,
  encodePosition,
  CHAPTER_ONLY_MAX_VERSE,
  parseVerseRange,
  parseChapterRange,
} from '../src/tools/utils.js';
import { lookupBook } from '../src/db/books.js';

// ─── Dataset types ─────────────────────────────────────────────────────────

export interface ControversyPosition {
  label: string;       // Short position name — must NOT contain adjudicative language
  view: string;        // One-sentence summary of this position
  evidence: string;    // Key textual or archaeological evidence
  scholars: string[];  // Named scholars who hold this view (at least 1)
}

export interface ControversySource {
  citation: string;    // Full bibliographic citation
  tier: 'A' | 'B' | 'C';  // A = peer-reviewed monograph, B = commentary, C = popular/secondary
}

export interface ControversyTopic {
  topic: string;       // Display name, e.g. 'Date of the Exodus'
  category: 'dating' | 'authorship' | 'composition' | 'historicity' | 'harmonization';
  rating: 'low' | 'medium' | 'high';
  summary: string;     // Neutral description of what is disputed — do NOT adjudicate
  keywords: string[];
  positions: ControversyPosition[];  // At least 2 required
  sources: ControversySource[];      // At least 1, with tier A or B required
  passages: string[];  // References like "Exodus 12:40-41" — MUST all resolve
  note?: string;
}

// ─── Curated dataset ────────────────────────────────────────────────────────
// 7 total topics (2 starters + 5 expansions). Each is genuinely balanced with
// real named scholars and Tier A/B sources. Slugs are derived at build time via
// slugify(topic). DO NOT adjudicate between positions — describe, do not decide.

export const CONTROVERSY_DATASET: ControversyTopic[] = [
  {
    topic: 'Date of the Exodus',
    category: 'dating',
    rating: 'high',
    summary:
      'Scholars dispute when the Israelite Exodus from Egypt occurred, with the two main proposals ' +
      'separated by roughly 200 years. The early (15th-century BCE) date is inferred from a literal ' +
      'reading of 1 Kings 6:1, while the late (13th-century BCE) date correlates with Egyptian ' +
      'archaeological evidence from the Ramesside period. Neither position commands consensus, and ' +
      'each faces unresolved exegetical and archaeological difficulties.',
    keywords: [
      'exodus', 'exodus date', 'early date', 'late date', '15th century', '13th century',
      'Ramesside', '1 Kings 6:1', 'Judges 11:26', 'Amarna', 'Merneptah stele',
    ],
    positions: [
      {
        label: 'Early (15th-century BCE) date',
        view:
          'The Exodus occurred ca. 1446 BCE, anchored by the 480-year figure in 1 Kings 6:1 and ' +
          'corroborated by Judges 11:26, which implies roughly 300 years of Israelite settlement ' +
          'prior to Jephthah.',
        evidence:
          '1 Kings 6:1 places the Exodus 480 years before Solomon\'s fourth regnal year (ca. 966 BCE), ' +
          'yielding ca. 1446 BCE. Judges 11:26 independently implies a long pre-monarchic settlement ' +
          'period. Proponents argue that the city Avaris (Tell el-Dab\'a) shows a Semitic population ' +
          'presence during the Middle Bronze Age consistent with an earlier sojourn. Some correlate the ' +
          'Amarna letters with the period of Israelite conquest.',
        scholars: ['Bryant Wood', 'John Bimson', 'Andrew Steinmann', 'Charles Aling'],
      },
      {
        label: 'Late (13th-century BCE) date',
        view:
          'The Exodus occurred ca. 1260–1250 BCE under Ramesses II (or near his reign), based on ' +
          'the reference to the store-city Raamses in Exodus 1:11 and the flourishing of Ramesside ' +
          'building projects in the eastern Delta during this period.',
        evidence:
          'Exodus 1:11 names Raamses as a store-city built by Israelite labor, widely identified with ' +
          'Pi-Ramesse, a major city under Ramesses II (1279–1213 BCE). The Merneptah Stele (ca. 1208 BCE) ' +
          'attests Israel as a people in Canaan, setting a terminus ante quem. The absence of clear ' +
          'Mycenaean Late Bronze Age destructions matching a 15th-century conquest at key Canaanite sites ' +
          'also weighs against the early date.',
        scholars: ['Kenneth Kitchen', 'James Hoffmeier', 'Alan Millard', 'Manfred Bietak (on Avaris)'],
      },
    ],
    sources: [
      {
        citation: 'Kitchen, K. A. On the Reliability of the Old Testament. Grand Rapids: Eerdmans, 2003.',
        tier: 'A',
      },
      {
        citation: 'Hoffmeier, J. K. Israel in Egypt: The Evidence for the Authenticity of the Exodus Tradition. Oxford: Oxford University Press, 1997.',
        tier: 'A',
      },
      {
        citation: 'Bimson, J. J. Redating the Exodus and Conquest. Sheffield: JSOT Press, 1978.',
        tier: 'A',
      },
      {
        citation: 'Wood, B. G. "The Sons of Jacob: New Evidence for the Presence of the Israelites in Egypt." Biblical Archaeology Review 34.2 (2008).',
        tier: 'B',
      },
    ],
    passages: ['Exodus 12:40-41', '1 Kings 6:1', 'Judges 11:26'],
  },
  {
    topic: 'Authorship and dating of Daniel',
    category: 'authorship',
    rating: 'high',
    summary:
      'Scholars are divided over whether the book of Daniel was composed by a single author in the ' +
      '6th century BCE (the traditional view) or by one or more authors writing in the 2nd century BCE ' +
      'during the Maccabean crisis. The dispute turns on the interpretation of detailed prophecy in ' +
      'chapters 7–12, the linguistic character of the Aramaic and Hebrew sections, and historical ' +
      'details in chapter 1 and 5. Both positions have substantial scholarly representation.',
    keywords: [
      'Daniel', 'authorship', 'vaticinium ex eventu', 'Maccabean', '6th century', '2nd century',
      'Antiochus Epiphanes', 'Daniel 11', 'Aramaic', 'apocalyptic', 'single authorship',
    ],
    positions: [
      {
        label: 'Traditional 6th-century single-author view',
        view:
          'Daniel the Jew wrote the book in Babylon during the 6th century BCE under Nebuchadnezzar, ' +
          'Belshazzar, and Darius the Mede, and the detailed predictions of chapters 7–12 are genuine ' +
          'predictive prophecy.',
        evidence:
          'The book presents itself as first-person testimony from the 6th century (Dan 1:1; 7:1). ' +
          'Jesus cites Daniel as prophetic (Matt 24:15). Dead Sea Scroll manuscripts of Daniel predate ' +
          'the Maccabean period sufficiently to suggest a pre-2nd century composition. The early Old ' +
          'Greek translation implies circulation well before 165 BCE. Proponents argue that "Darius ' +
          'the Mede" is a historical figure whose identity has not yet been definitively resolved, and ' +
          'that "vaticinium ex eventu" arguments depend on a prior commitment against predictive prophecy.',
        scholars: ['Joyce Baldwin', 'Stephen Miller', 'Gleason Archer'],
      },
      {
        label: 'Maccabean 2nd-century pseudepigraphical view',
        view:
          'The book of Daniel reached its final form in the 160s BCE, composed pseudepigraphically to ' +
          'encourage Jews facing the persecution of Antiochus IV Epiphanes, with chapters 7–12 describing ' +
          'those events as if predicted from the 6th century.',
        evidence:
          'Daniel 11:2–35 tracks Hellenistic history with extraordinary accuracy up to Antiochus IV, then ' +
          'becomes vague at 11:40, suggesting the author\'s horizon. Linguistic analysis finds late Biblical ' +
          'Hebrew forms and an Aramaic dialect consistent with the 3rd–2nd century. The absence of Daniel ' +
          'from Ben Sira\'s "Praise of the Fathers" (ca. 180 BCE) is cited as evidence the book was not yet ' +
          'widely known. The genre of pseudepigraphical apocalyptic has close parallels in 2nd-century Jewish ' +
          'literature.',
        scholars: ['John J. Collins', 'Louis Hartman', 'Klaus Koch', 'Norman Porteous'],
      },
    ],
    sources: [
      {
        citation: 'Baldwin, J. G. Daniel: An Introduction and Commentary. Tyndale Old Testament Commentaries. Leicester: IVP, 1978.',
        tier: 'B',
      },
      {
        citation: 'Collins, J. J. Daniel: A Commentary on the Book of Daniel. Hermeneia. Minneapolis: Fortress, 1993.',
        tier: 'A',
      },
      {
        citation: 'Miller, S. R. Daniel. New American Commentary. Nashville: Broadman & Holman, 1994.',
        tier: 'B',
      },
      {
        citation: 'Goldingay, J. Daniel. Word Biblical Commentary 30. Dallas: Word Books, 1989.',
        tier: 'A',
      },
    ],
    passages: ['Daniel 1:1', 'Daniel 11:2-35'],
  },
  {
    topic: 'Authorship and composition of the Pentateuch',
    category: 'composition',
    rating: 'high',
    summary:
      'Scholars dispute whether the Pentateuch (Genesis through Deuteronomy) was composed by Moses ' +
      'as a substantially unified work or by multiple authors and editors over several centuries whose ' +
      'contributions were identified and labeled by Julius Wellhausen\'s Documentary Hypothesis (J, E, D, P). ' +
      'The debate centers on literary doublets, divine name variation, stylistic differences, and the nature ' +
      'of Deuteronomy\'s relationship to the rest of the corpus. Neither position commands a single critical consensus.',
    keywords: [
      'Pentateuch', 'Documentary Hypothesis', 'JEDP', 'Wellhausen', 'Mosaic authorship',
      'source criticism', 'Yahwist', 'Elohist', 'Deuteronomist', 'Priestly source',
      'composition', 'Genesis', 'Exodus', 'Deuteronomy',
    ],
    positions: [
      {
        label: 'Multiple-source Documentary Hypothesis view',
        view:
          'The Pentateuch was composed from four originally independent written sources (J, E, D, P) ' +
          'produced between the 10th and 6th centuries BCE and woven together by redactors, with Moses ' +
          'playing little or no role as an author of the final text.',
        evidence:
          'Divine name variation (YHWH vs. Elohim) in parallel narratives (e.g. the flood story in Gen 6–9), ' +
          'literary doublets (two creation accounts, two calls of Abraham), and the distinctive legal and ' +
          'theological vocabulary of Deuteronomy (D) vs. Leviticus (P) are the primary literary evidence. ' +
          'Wellhausen argued that the religious institutions described in the Pentateuch fit a late monarchic ' +
          'or post-exilic development. Richard Elliott Friedman refined the source analysis, and Joel Baden ' +
          'has defended the J and E sources as independently recoverable documents.',
        scholars: ['Julius Wellhausen', 'Richard Elliott Friedman', 'Joel Baden'],
      },
      {
        label: 'Substantial Mosaic authorship and unity view',
        view:
          'The Pentateuch was composed by Moses or substantially under his authority in the late second ' +
          'millennium BCE, with the divine name variation and stylistic differences explicable by genre, ' +
          'audience, and theological emphasis rather than multiple authors.',
        evidence:
          'Deuteronomy 31:24-26 records Moses writing "this law" in a book; Exodus 24:4 records Moses ' +
          'writing "all the words of the LORD." Second-millennium parallels to legal codes (e.g. the Hittite ' +
          'suzerainty treaties resembling Deuteronomy\'s covenant structure) support early composition. ' +
          'Umberto Cassuto analyzed the divine name variation and argued it follows semantic rather than ' +
          'documentary rules. Kenneth Kitchen and Gleason Archer both demonstrated extensive ancient Near ' +
          'Eastern parallels to Pentateuchal material. Duane Garrett examined the compositional structure ' +
          'and proposed unified authorial intent.',
        scholars: ['Umberto Cassuto', 'Kenneth Kitchen', 'Gleason Archer', 'Duane Garrett'],
      },
    ],
    sources: [
      {
        citation: 'Friedman, R. E. Who Wrote the Bible? New York: Summit Books, 1987.',
        tier: 'B',
      },
      {
        citation: 'Kitchen, K. A. On the Reliability of the Old Testament. Grand Rapids: Eerdmans, 2003.',
        tier: 'A',
      },
      {
        citation: 'Baden, J. S. The Composition of the Pentateuch: Renewing the Documentary Hypothesis. New Haven: Yale University Press, 2012.',
        tier: 'A',
      },
      {
        citation: 'Cassuto, U. The Documentary Hypothesis and the Composition of the Pentateuch. Jerusalem: Magnes Press, 1961.',
        tier: 'A',
      },
    ],
    passages: ['Deuteronomy 31:24-26', 'Exodus 24:4'],
  },
  {
    topic: 'Unity and authorship of Isaiah',
    category: 'authorship',
    rating: 'high',
    summary:
      'Scholars debate whether the book of Isaiah was written by a single 8th-century BCE prophet or ' +
      'by multiple authors writing in different eras: an 8th-century First Isaiah (chapters 1–39), a ' +
      '6th-century exilic Deutero-Isaiah (chapters 40–55), and possibly a Trito-Isaiah (chapters 56–66). ' +
      'The debate turns on the naming of Cyrus of Persia in Isaiah 44–45, the shift in historical horizon, ' +
      'and literary differences between the two major sections.',
    keywords: [
      'Isaiah', 'Deutero-Isaiah', 'Trito-Isaiah', 'Second Isaiah', 'unity', 'authorship',
      'Cyrus', 'servant songs', '8th century', 'exilic', 'predictive prophecy', 'Duhm',
    ],
    positions: [
      {
        label: 'Single 8th-century Isaiah view',
        view:
          'The entire book of Isaiah was written by the 8th-century BCE prophet Isaiah ben Amoz, ' +
          'with chapters 40–66 representing genuine predictive prophecy of the Babylonian exile and ' +
          'the role of Cyrus, not a later composition by a second author.',
        evidence:
          'Isaiah 1:1 names a single prophetic author active "in the days of Uzziah, Jotham, Ahaz, ' +
          'and Hezekiah." The New Testament cites both sections of Isaiah under the single name of ' +
          '"Isaiah the prophet" (cf. John 12:38-41). Dead Sea Scroll evidence (1QIsa-a) shows the book ' +
          'as a single undivided scroll with no scribal break between chapters 39 and 40. J. Alec Motyer ' +
          'and John Oswalt argue that the thematic and linguistic connections across the two major sections ' +
          'point to unified authorial intent. O. T. Allis defended single authorship against the critical ' +
          'consensus on exegetical grounds.',
        scholars: ['J. Alec Motyer', 'John Oswalt', 'O. T. Allis'],
      },
      {
        label: 'Multiple-author Deutero-Isaiah view',
        view:
          'Chapters 40–55 (Deutero-Isaiah) and possibly 56–66 (Trito-Isaiah) were composed by one or ' +
          'more anonymous prophets writing during or after the Babylonian exile (6th century BCE), and ' +
          'the explicit naming of Cyrus reflects the historical situation of the author rather than ' +
          'predictive prophecy from the 8th century.',
        evidence:
          'Bernhard Duhm identified three distinct sections in 1892, noting the sharply different ' +
          'historical horizon (Babylon as present threat, not future) and the direct address to exiles ' +
          'in chapters 40–55. Stylistic analysis reveals a denser use of the "servant songs" motif ' +
          'absent from chapters 1–39. Joseph Blenkinsopp\'s Anchor Bible commentary provides detailed ' +
          'redactional analysis of the book\'s compositional history. Brevard Childs, while emphasizing ' +
          'canonical unity, acknowledged the two-author historical analysis as exegetically significant.',
        scholars: ['Bernhard Duhm', 'Joseph Blenkinsopp', 'Brevard Childs'],
      },
    ],
    sources: [
      {
        citation: 'Oswalt, J. N. The Book of Isaiah, Chapters 1–39. New International Commentary on the Old Testament. Grand Rapids: Eerdmans, 1986.',
        tier: 'B',
      },
      {
        citation: 'Childs, B. S. Introduction to the Old Testament as Scripture. Philadelphia: Fortress, 1979.',
        tier: 'A',
      },
      {
        citation: 'Blenkinsopp, J. Isaiah 40–55. Anchor Bible 19A. New York: Doubleday, 2002.',
        tier: 'A',
      },
      {
        citation: 'Motyer, J. A. The Prophecy of Isaiah: An Introduction and Commentary. Downers Grove: IVP, 1993.',
        tier: 'B',
      },
    ],
    passages: ['Isaiah 1:1', 'Isaiah 40:1-2', 'Isaiah 44:28'],
  },
  {
    topic: 'Conquest of Canaan models',
    category: 'historicity',
    rating: 'high',
    summary:
      'Scholars have proposed three competing models to explain how ancient Israel came to occupy the ' +
      'land of Canaan: a military conquest largely as described in Joshua, a gradual peaceful infiltration ' +
      'of semi-nomadic tribes, or an internal sociological revolt of indigenous Canaanite peasants. ' +
      'Each model draws on a combination of biblical text, archaeological data, and sociological theory, ' +
      'and no single model is accepted by all scholars.',
    keywords: [
      'conquest', 'Canaan', 'Joshua', 'Judges', 'Jericho', 'Albright', 'Alt', 'Noth', 'Mendenhall',
      'Finkelstein', 'Late Bronze Age', 'settlement', 'iron age', 'infiltration', 'revolt',
    ],
    positions: [
      {
        label: 'Military conquest model',
        view:
          'Israel entered Canaan under Joshua and conquered it through a series of military campaigns ' +
          'largely as described in the book of Joshua, with archaeological destruction layers at key ' +
          'Canaanite sites providing corroborating evidence.',
        evidence:
          'Joshua 6:20-21 and Joshua 11:16-23 describe comprehensive military victories. William F. Albright ' +
          'identified Late Bronze Age destruction layers at sites such as Lachish, Bethel, and Tell Beit ' +
          'Mirsim with the Israelite conquest. Yigael Yadin\'s excavations at Hazor documented a massive ' +
          'destruction layer at the end of the Late Bronze Age (ca. 13th century BCE) that he attributed ' +
          'to the Israelite conquest described in Joshua 11:10-11. The Merneptah Stele (ca. 1209 BCE) ' +
          'attests Israel as a people group already present in Canaan, establishing an external anchor ' +
          'that the Israelite settlement was underway by the late 13th century. Proponents argue that the ' +
          'biblical text\'s internal coherence — its named commanders, specific battle sequences, and ' +
          'un-idealized acknowledgments of incomplete conquest (Judges 1) — reflects genuine historical ' +
          'memory rather than invention. Bryant Wood (a minority position among archaeologists) challenged ' +
          'Kathleen Kenyon\'s dating of Jericho and argued the evidence at Tell es-Sultan fits a ' +
          '15th-century conquest.',
        scholars: ['William F. Albright', 'Yigael Yadin', 'Bryant Wood (on Jericho re-dating)'],
      },
      {
        label: 'Peaceful infiltration model',
        view:
          'Israel emerged in Canaan through the gradual, largely peaceful infiltration of semi-nomadic ' +
          'pastoral groups who settled the highlands over several generations rather than through a ' +
          'rapid military conquest.',
        evidence:
          'Albrecht Alt proposed that the Israelite tribes entered as seasonal pastoralists who eventually ' +
          'settled the less-populated hill country. Martin Noth refined this model by noting that the ' +
          'conquest narratives in Joshua are partly etiological legends rather than historical records of ' +
          'a unified campaign. Judges 1:27-36 itself acknowledges that many Canaanite cities were not ' +
          'conquered, contradicting the comprehensive picture in Joshua.',
        scholars: ['Albrecht Alt', 'Martin Noth'],
      },
      {
        label: 'Internal revolt / gradual emergence model',
        view:
          'Israel emerged from within Canaanite society through a socio-political revolt of indigenous ' +
          'peasants and marginalized groups against the Late Bronze Age city-state system, with the ' +
          '"Israelites" being largely indigenous Canaanites who adopted a new identity.',
        evidence:
          'George Mendenhall argued that the Habiru/Apiru social class known from Egyptian and Akkadian ' +
          'texts represented a precursor to or analogue of early Israel — people who withdrew from the ' +
          'existing social order. Israel Finkelstein\'s archaeological survey of the central highlands ' +
          'identified a wave of small, unfortified Iron Age I villages as evidence of indigenous settlement ' +
          'emergence rather than external invasion. Finkelstein and Neil Asher Silberman synthesized the ' +
          'archaeological evidence with a model of gradual Canaanite social differentiation.',
        scholars: ['George Mendenhall', 'Israel Finkelstein', 'Neil Asher Silberman'],
      },
    ],
    sources: [
      {
        citation: 'Finkelstein, I. and Silberman, N. A. The Bible Unearthed: Archaeology\'s New Vision of Ancient Israel and the Origin of Its Sacred Texts. New York: Free Press, 2001.',
        tier: 'B',
      },
      {
        citation: 'Albright, W. F. The Biblical Period from Abraham to Ezra. New York: Harper & Row, 1963.',
        tier: 'B',
      },
      {
        citation: 'Mendenhall, G. E. "The Hebrew Conquest of Palestine." Biblical Archaeologist 25.3 (1962): 66–87.',
        tier: 'B',
      },
    ],
    passages: ['Joshua 6:20-21', 'Joshua 11:16-23', 'Judges 1:27-36'],
  },
  {
    topic: 'Historicity and scale of the United Monarchy',
    category: 'historicity',
    rating: 'high',
    summary:
      'Scholars dispute whether the biblical portrayal of David and Solomon\'s United Monarchy — a ' +
      'powerful centralized state controlling a large territory — reflects historical reality or represents ' +
      'a later literary idealization. The debate is anchored in the archaeological evidence from 10th-century ' +
      'BCE Israel and Judah and in the interpretation of the Tel Dan inscription and Mesha Stele.',
    keywords: [
      'David', 'Solomon', 'United Monarchy', 'Tel Dan inscription', 'Mesha Stele', 'Jerusalem',
      'Finkelstein', 'low chronology', 'Dever', 'Mazar', 'Iron Age', '10th century', 'minimalism',
    ],
    positions: [
      {
        label: 'Substantial historical United Monarchy view',
        view:
          'David and Solomon ruled a significant territorial state in the 10th century BCE, broadly ' +
          'consistent with the biblical account, with archaeological evidence from Jerusalem and the ' +
          'highland region supporting a complex administrative polity.',
        evidence:
          '1 Kings 4:20-21 and 2 Samuel 5:4-5 describe the scope of Solomon\'s kingdom and David\'s ' +
          'reign. The Tel Dan inscription (9th century BCE) refers to "the house of David," providing ' +
          'extra-biblical attestation for the Davidic dynasty. William Dever argued that monumental ' +
          'architecture at Megiddo, Hazor, and Gezer (cf. 1 Kgs 9:15) fits a 10th-century building ' +
          'program. Amihai Mazar and Kenneth Kitchen both defended a "high chronology" placing ' +
          'these structures within the United Monarchy period.',
        scholars: ['William Dever', 'Amihai Mazar', 'Kenneth Kitchen'],
      },
      {
        label: 'Minimalist / modest chiefdom view',
        view:
          'The biblical United Monarchy is substantially a later literary construction; the archaeological ' +
          'record supports only a small highland chiefdom in the 10th century BCE, with Jerusalem a modest ' +
          'town and the elaborate Solomonic building projects unattested at the proposed dates.',
        evidence:
          'Israel Finkelstein proposed a "low chronology" that redates the traditionally Solomonic ' +
          'monumental gates at Megiddo, Hazor, and Gezer to the 9th century under the Omride dynasty, ' +
          'removing the key architectural evidence for a 10th-century empire. Neil Asher Silberman and ' +
          'Finkelstein in "The Bible Unearthed" argued that the Jerusalem of David\'s era shows no ' +
          'evidence of a major administrative center, and that the elaborate Solomonic accounts reflect ' +
          'the ideological program of later Judahite scribes.',
        scholars: ['Israel Finkelstein', 'Neil Asher Silberman'],
      },
    ],
    sources: [
      {
        citation: 'Finkelstein, I. and Silberman, N. A. The Bible Unearthed: Archaeology\'s New Vision of Ancient Israel and the Origin of Its Sacred Texts. New York: Free Press, 2001.',
        tier: 'B',
      },
      {
        citation: 'Mazar, A. "The Search for David and Solomon: An Archaeological Perspective." In The Quest for the Historical Israel, edited by B. Schmidt. Atlanta: SBL, 2007.',
        tier: 'A',
      },
      {
        citation: 'Kitchen, K. A. On the Reliability of the Old Testament. Grand Rapids: Eerdmans, 2003.',
        tier: 'A',
      },
    ],
    passages: ['2 Samuel 5:4-5', '1 Kings 4:20-21'],
  },
  {
    topic: 'Historicity of the Patriarchal narratives',
    category: 'historicity',
    rating: 'high',
    summary:
      'Scholars debate whether the Patriarchal narratives in Genesis (Abraham, Isaac, Jacob, Joseph) ' +
      'preserve authentic memories of second-millennium BCE historical figures and customs or are ' +
      'largely late literary compositions with no recoverable historical core. The dispute turns on ' +
      'the interpretation of the ancient Near Eastern parallels, the dating of biblical customs, and ' +
      'the use of proper names and place references.',
    keywords: [
      'Abraham', 'Isaac', 'Jacob', 'patriarchs', 'Genesis', 'historicity', 'second millennium',
      'Thompson', 'Van Seters', 'Kitchen', 'Wenham', 'ancient Near East', 'Nuzi', 'Ebla',
    ],
    positions: [
      {
        label: 'Second-millennium historical memory view',
        view:
          'The Patriarchal narratives preserve genuine historical memories of figures who lived in the ' +
          'second millennium BCE, with the customs, social practices, and place names reflecting a ' +
          'milieu that the later biblical period could not have invented.',
        evidence:
          'Kenneth Kitchen identified parallels between Patriarchal customs (land purchase contracts, ' +
          'marriage and adoption practices) and second-millennium ancient Near Eastern texts such as ' +
          'the Nuzi tablets and the Mari archives. The purchase of the cave of Machpelah in Genesis ' +
          '23:1-20 reflects Hittite land-sale conventions. Gordon Wenham\'s Genesis commentary examines ' +
          'the early covenant forms consistent with second-millennium treaty patterns. John Bimson has ' +
          'defended the historical plausibility of the migration narratives.',
        scholars: ['Kenneth Kitchen', 'Gordon Wenham', 'John Bimson'],
      },
      {
        label: 'Late literary / non-historical composition view',
        view:
          'The Patriarchal narratives are literary compositions from the first millennium BCE with no ' +
          'recoverable historical core; the supposed second-millennium parallels are either too general ' +
          'or too vaguely dated to establish authenticity, and the narratives reflect the concerns of ' +
          'later Israelite communities.',
        evidence:
          'Thomas L. Thompson argued in detail that the supposed Nuzi parallels are not exclusive to ' +
          'the second millennium and do not establish a historical setting for the Patriarchs. John Van ' +
          'Seters maintained that the Abraham traditions in Genesis reflect first-millennium social and ' +
          'literary contexts rather than genuine patriarchal-era sources. Genesis 12:1-3 and the broader ' +
          'Patriarchal call narratives are read as ideological charter myths legitimating later Israelite ' +
          'land claims rather than historical records.',
        scholars: ['Thomas L. Thompson', 'John Van Seters'],
      },
    ],
    sources: [
      {
        citation: 'Kitchen, K. A. On the Reliability of the Old Testament. Grand Rapids: Eerdmans, 2003.',
        tier: 'A',
      },
      {
        citation: 'Thompson, T. L. The Historicity of the Patriarchal Narratives. Berlin: De Gruyter, 1974.',
        tier: 'A',
      },
      {
        citation: 'Wenham, G. J. Genesis 16–50. Word Biblical Commentary 2. Dallas: Word Books, 1994.',
        tier: 'B',
      },
      {
        citation: 'Van Seters, J. Abraham in History and Tradition. New Haven: Yale University Press, 1975.',
        tier: 'A',
      },
    ],
    passages: ['Genesis 12:1-3', 'Genesis 23:1-20'],
  },
];

// ─── Reference parser (mirrors seed-liturgical.ts) ──────────────────────────

function parseReference(ref: string): { book: string; range: string } | null {
  const match = ref.match(/^(.+?)\s+(\d+(?::\d+)?(?:-\d+(?::\d+)?)?)$/);
  if (!match) return null;
  return { book: match[1], range: match[2] };
}

// ─── Row types ──────────────────────────────────────────────────────────────

export interface ControversyPassageRow {
  controversy_id: number;
  book: string;
  start_chapter: number;
  start_verse: number;
  end_chapter: number;
  end_verse: number;
  start_enc: number;
  end_enc: number;
  reference_display: string;
}

// ─── Row builders ────────────────────────────────────────────────────────────

/**
 * Build all passage rows for a topic.
 * THROWS (via expect-to-fail in tests) if any passage cannot be resolved.
 * Distinct from seed-liturgical which warn-drops — here unresolvable passages are errors.
 */
export function buildPassageRows(
  topic: ControversyTopic,
  controversyId: number
): ControversyPassageRow[] {
  const rows: ControversyPassageRow[] = [];

  for (const passage of topic.passages) {
    const parsed = parseReference(passage);
    if (!parsed) {
      throw new Error(`[seed-controversies] Cannot parse reference: "${passage}" in topic "${topic.topic}"`);
    }

    const bookInfo = lookupBook(parsed.book);
    if (!bookInfo) {
      throw new Error(`[seed-controversies] Unresolvable book: "${parsed.book}" in reference "${passage}" in topic "${topic.topic}"`);
    }

    let startChapter: number;
    let startVerse: number;
    let endChapter: number;
    let endVerse: number;

    if (parsed.range.includes(':')) {
      const result = parseVerseRange(parsed.range);
      if ('error' in result) {
        throw new Error(`[seed-controversies] Cannot parse verse range "${parsed.range}" in "${passage}": ${result.error}`);
      }
      startChapter = result.startChapter;
      startVerse = result.startVerse;
      endChapter = result.endChapter;
      endVerse = result.endVerse;
    } else {
      const result = parseChapterRange(parsed.range);
      if ('error' in result) {
        throw new Error(`[seed-controversies] Cannot parse chapter range "${parsed.range}" in "${passage}": ${result.error}`);
      }
      if (result.min === undefined) {
        throw new Error(`[seed-controversies] Empty chapter range in "${passage}"`);
      }
      startChapter = result.min;
      startVerse = 1;
      endChapter = result.max ?? result.min;
      endVerse = CHAPTER_ONLY_MAX_VERSE;
    }

    rows.push({
      controversy_id: controversyId,
      book: bookInfo.canonical,
      start_chapter: startChapter,
      start_verse: startVerse,
      end_chapter: endChapter,
      end_verse: endVerse,
      start_enc: encodePosition(startChapter, startVerse),
      end_enc: encodePosition(endChapter, endVerse),
      reference_display: passage,
    });
  }

  return rows;
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────

function escapeSQL(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function escapeNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return String(val);
}

// ─── SQL emitters ─────────────────────────────────────────────────────────────

export function topicInsertSql(id: number, topic: ControversyTopic): string {
  const slug = slugify(topic.topic);
  return (
    `INSERT OR REPLACE INTO controversy_topics ` +
    `(id, topic, slug, category, rating, summary, positions, keywords, sources, note, source) VALUES (` +
    `${escapeNum(id)}, ` +
    `${escapeSQL(topic.topic)}, ` +
    `${escapeSQL(slug)}, ` +
    `${escapeSQL(topic.category)}, ` +
    `${escapeSQL(topic.rating)}, ` +
    `${escapeSQL(topic.summary)}, ` +
    `${escapeSQL(JSON.stringify(topic.positions))}, ` +
    `${escapeSQL(JSON.stringify(topic.keywords))}, ` +
    `${escapeSQL(JSON.stringify(topic.sources))}, ` +
    `${escapeSQL(topic.note ?? null)}, ` +
    `'curated-in-house');`
  );
}

export function passageInsertSql(id: number, row: ControversyPassageRow): string {
  return (
    `INSERT OR REPLACE INTO controversy_passages ` +
    `(id, controversy_id, book, start_chapter, start_verse, end_chapter, end_verse, start_enc, end_enc, reference_display) VALUES (` +
    `${escapeNum(id)}, ` +
    `${escapeNum(row.controversy_id)}, ` +
    `${escapeSQL(row.book)}, ` +
    `${escapeNum(row.start_chapter)}, ` +
    `${escapeNum(row.start_verse)}, ` +
    `${escapeNum(row.end_chapter)}, ` +
    `${escapeNum(row.end_verse)}, ` +
    `${escapeNum(row.start_enc)}, ` +
    `${escapeNum(row.end_enc)}, ` +
    `${escapeSQL(row.reference_display)});`
  );
}

// ─── ETL main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : '/tmp/controversies-seed.sql';

  console.log(`[seed-controversies] Output: ${outputPath}`);

  const lines: string[] = [
    '-- 0018_seed_controversies.sql',
    '-- Generated by seed-controversies.ts — do not edit manually.',
    '-- Apply after 0017_add_controversies.sql',
    '-- Apply with: npx wrangler d1 execute <DB_NAME> --file=<this-file> --remote',
    '',
    '-- Controversy topics and passages',
  ];

  let topicId = 0;
  let passageId = 0;
  let totalTopics = 0;
  let totalPassages = 0;

  for (const topic of CONTROVERSY_DATASET) {
    topicId++;
    totalTopics++;
    lines.push(topicInsertSql(topicId, topic));

    const passageRows = buildPassageRows(topic, topicId);
    for (const row of passageRows) {
      passageId++;
      totalPassages++;
      lines.push(passageInsertSql(passageId, row));
    }
  }

  const sql = lines.join('\n') + '\n';
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n[seed-controversies] Written to: ${outputPath}`);

  console.log('\n=== Validation Report ===');
  console.log(`Topics emitted:   ${totalTopics}`);
  console.log(`Passages emitted: ${totalPassages}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
