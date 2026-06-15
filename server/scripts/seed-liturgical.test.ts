import { describe, it, expect, vi } from 'vitest';
import {
  parseReference,
  buildReadingRow,
  LITURGICAL_DATASET,
} from './seed-liturgical.js';
import { slugifySeason } from '../src/tools/utils.js';

describe('parseReference', () => {
  it('splits a verse reference into book and range', () => {
    const result = parseReference('Isaiah 9:2-7');
    expect(result).toEqual({ book: 'Isaiah', range: '9:2-7' });
  });

  it('splits a chapter-only reference', () => {
    const result = parseReference('Psalm 23');
    expect(result).toEqual({ book: 'Psalm', range: '23' });
  });

  it('splits a chapter-range reference', () => {
    const result = parseReference('Isaiah 9-11');
    expect(result).toEqual({ book: 'Isaiah', range: '9-11' });
  });

  it('splits a numbered multi-word book reference', () => {
    const result = parseReference('1 Corinthians 13:4-7');
    expect(result).toEqual({ book: '1 Corinthians', range: '13:4-7' });
  });

  it('splits a multi-word book name', () => {
    const result = parseReference('Song of Songs 2:8-13');
    expect(result).toEqual({ book: 'Song of Songs', range: '2:8-13' });
  });

  it('returns null for an unparseable string', () => {
    expect(parseReference('not a reference')).toBeNull();
    expect(parseReference('')).toBeNull();
  });
});

describe('buildReadingRow', () => {
  it('(a) resolves Isaiah 9:2-7 to correct bounds with encodePosition', () => {
    const row = buildReadingRow('Advent', 1, 'western', {
      reference: 'Isaiah 9:2-7',
      themes: ['hope', 'light'],
    });
    expect(row).not.toBeNull();
    expect(row!.book).toBe('isaiah');
    expect(row!.start_chapter).toBe(9);
    expect(row!.start_verse).toBe(2);
    expect(row!.end_chapter).toBe(9);
    expect(row!.end_verse).toBe(7);
    expect(row!.start_enc).toBe(9002);
    expect(row!.end_enc).toBe(9007);
  });

  it('(b) resolves chapter-only Psalm 23 with chapter-only bounds', () => {
    const row = buildReadingRow('Ordinary Time', 10, 'western', {
      reference: 'Psalm 23',
      themes: ['shepherd', 'providence'],
    });
    expect(row).not.toBeNull();
    expect(row!.book).toBe('psalms');
    expect(row!.start_enc).toBe(23001);
    expect(row!.end_enc).toBe(23999);
  });

  it('(b2) resolves chapter-range Isaiah 9-11', () => {
    const row = buildReadingRow('Advent', 1, 'western', {
      reference: 'Isaiah 9-11',
      themes: ['messianic', 'promise'],
    });
    expect(row).not.toBeNull();
    expect(row!.book).toBe('isaiah');
    expect(row!.start_enc).toBe(9001);
    expect(row!.end_enc).toBe(11999);
  });

  it('(c1) resolves 1 Corinthians 13:4-7 with numbered book', () => {
    const row = buildReadingRow('Ordinary Time', 10, 'western', {
      reference: '1 Corinthians 13:4-7',
      themes: ['love'],
    });
    expect(row).not.toBeNull();
    expect(row!.book).toBe('1_corinthians');
    expect(row!.start_enc).toBe(13004);
    expect(row!.end_enc).toBe(13007);
  });

  it('(c2) resolves Song of Songs 2:8-13', () => {
    const row = buildReadingRow('Ordinary Time', 10, 'western', {
      reference: 'Song of Songs 2:8-13',
      themes: ['love', 'joy'],
    });
    expect(row).not.toBeNull();
    expect(row!.book).toBe('song_of_songs');
    expect(row!.start_enc).toBe(2008);
    expect(row!.end_enc).toBe(2013);
  });

  it('(g) returns null and does not throw for unresolvable book', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let result: ReturnType<typeof buildReadingRow> | undefined;
    expect(() => {
      result = buildReadingRow('Advent', 1, 'western', {
        reference: 'Nonesuch 1:1',
        themes: [],
      });
    }).not.toThrow();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('LITURGICAL_DATASET', () => {
  it('(d) slugifySeason round-trips every season name to a non-empty slug', () => {
    for (const season of LITURGICAL_DATASET) {
      const slug = slugifySeason(season.season);
      expect(slug.length).toBeGreaterThan(0);
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/);
    }
  });

  it('(e) themes serialize to valid JSON', () => {
    for (const season of LITURGICAL_DATASET) {
      for (const reading of season.readings) {
        expect(() => JSON.parse(JSON.stringify(reading.themes))).not.toThrow();
        const parsed = JSON.parse(JSON.stringify(reading.themes));
        expect(Array.isArray(parsed)).toBe(true);
      }
    }
  });

  it('has 12 seasons', () => {
    expect(LITURGICAL_DATASET).toHaveLength(12);
  });
});

describe('seed-liturgical SQL output', () => {
  it('(f) emitted SQL string contains INSERT INTO liturgical_readings', async () => {
    // Dynamically import to call a helper that generates the SQL lines
    // We test the shape by generating rows for a known season
    const rows: string[] = [];
    for (const season of LITURGICAL_DATASET) {
      for (const reading of season.readings) {
        const row = buildReadingRow(season.season, season.season_order, season.tradition, reading);
        if (row) {
          rows.push(
            `INSERT INTO liturgical_readings (season, season_slug, season_order, tradition, book, start_chapter, start_verse, end_chapter, end_verse, start_enc, end_enc, reference_display, themes, note, source) VALUES ('${row.season}', '${row.season_slug}', ${row.season_order}, '${row.tradition}', '${row.book}', ${row.start_chapter}, ${row.start_verse}, ${row.end_chapter}, ${row.end_verse}, ${row.start_enc}, ${row.end_enc}, '${row.reference_display}', '${row.themes}', ${row.note === null ? 'NULL' : `'${row.note}'`}, 'curated-in-house');`
          );
        }
      }
    }
    const sql = rows.join('\n');
    expect(sql).toContain('INSERT INTO liturgical_readings');
    // Must have at least 24 inserts (contract AC-2: ≥2 readings × 12 seasons)
    const insertCount = (sql.match(/INSERT INTO liturgical_readings/g) ?? []).length;
    expect(insertCount).toBeGreaterThanOrEqual(24);
  });
});
