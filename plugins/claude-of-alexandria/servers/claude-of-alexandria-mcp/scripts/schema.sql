CREATE TABLE IF NOT EXISTS discourse_features (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  feature TEXT NOT NULL,
  feature_description TEXT,
  word TEXT
);
CREATE INDEX IF NOT EXISTS idx_discourse_book ON discourse_features(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_discourse_feature ON discourse_features(feature);

CREATE TABLE IF NOT EXISTS paragraph_markers (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  marker_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_markers_book ON paragraph_markers(book, chapter, verse);

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  lemma TEXT NOT NULL,
  frequency INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vocab_book_lemma ON vocabulary(book, lemma);
CREATE INDEX IF NOT EXISTS idx_vocab_book_chapter ON vocabulary(book, chapter);
CREATE INDEX IF NOT EXISTS idx_vocab_frequency ON vocabulary(book, frequency);

CREATE TABLE IF NOT EXISTS vocabulary_clusters (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  lemma TEXT NOT NULL,
  concentration REAL NOT NULL,
  chapter_start INTEGER NOT NULL,
  chapter_end INTEGER NOT NULL,
  total_occurrences INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_book ON vocabulary_clusters(book, lemma);

CREATE TABLE IF NOT EXISTS thematic_keywords (
  theme TEXT NOT NULL,
  lemma TEXT NOT NULL,
  testament TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_theme ON thematic_keywords(theme, testament);

CREATE TABLE IF NOT EXISTS morphology (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  testament TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  word_position INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalized TEXT,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  parsing TEXT
);
CREATE INDEX IF NOT EXISTS idx_morph_range ON morphology(book, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_morph_lemma ON morphology(lemma);
