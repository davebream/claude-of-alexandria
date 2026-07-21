import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryOtStructure } from './ot-structure.js';
import * as queryModule from '../db/query.js';

vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

const mockQuery = vi.mocked(queryModule.query);

const SAMPLE_ROWS = [
  {
    book: 'genesis',
    boundary_ordinal: 1,
    before_chapter: 1,
    before_verse: 1,
    after_chapter: 1,
    after_verse: 2,
    before_ref_enc: 1001,
    after_ref_enc: 1002,
    previous_sentence_ended: 1,
    new_sentence_begins: 1,
    open_clause_depth: 0,
    clause_end_count: 1,
    clause_start_count: 1,
    clause_endings_json: JSON.stringify([{ class: 'cl', rule: 'PP-V-S-O', role: null }]),
    clause_beginnings_json: JSON.stringify([{ class: 'cl', rule: 'S-V', role: null }]),
    participants_before_json: JSON.stringify(['010010010031']),
    participants_after_json: JSON.stringify(['010010020021']),
    participants_entered_json: JSON.stringify(['010010020021']),
    participants_exited_json: JSON.stringify(['010010010031']),
    participant_set_changed: 1,
    speakers_before_json: JSON.stringify([]),
    speakers_after_json: JSON.stringify([]),
    speaker_changed: 0,
    quotation_opened: 0,
    quotation_closed: 0,
    quotations_opened_json: JSON.stringify([]),
    quotations_closed_json: JSON.stringify([]),
    source_macula_commit: 'macula-sha',
    source_speaker_commit: 'speaker-sha',
  },
  {
    book: 'genesis',
    boundary_ordinal: 2,
    before_chapter: 1,
    before_verse: 2,
    after_chapter: 1,
    after_verse: 3,
    before_ref_enc: 1002,
    after_ref_enc: 1003,
    previous_sentence_ended: 1,
    new_sentence_begins: 1,
    open_clause_depth: 0,
    clause_end_count: 1,
    clause_start_count: 1,
    clause_endings_json: JSON.stringify([{ class: 'cl', rule: 'AdjpCL', role: null }]),
    clause_beginnings_json: JSON.stringify([{ class: 'cl', rule: 'V-S', role: null }]),
    participants_before_json: JSON.stringify([]),
    participants_after_json: JSON.stringify(['010010030021']),
    participants_entered_json: JSON.stringify(['010010030021']),
    participants_exited_json: JSON.stringify([]),
    participant_set_changed: 1,
    speakers_before_json: JSON.stringify([]),
    speakers_after_json: JSON.stringify(['God']),
    speaker_changed: 1,
    quotation_opened: 1,
    quotation_closed: 0,
    quotations_opened_json: JSON.stringify([{ speech_key: 'GEN 1:3|GEN 1:3|God', speaker_id: 'God', speaker_label: 'God', quote_type: 'Normal' }]),
    quotations_closed_json: JSON.stringify([]),
    source_macula_commit: 'macula-sha',
    source_speaker_commit: 'speaker-sha',
  },
  {
    book: 'genesis',
    boundary_ordinal: 3,
    before_chapter: 1,
    before_verse: 3,
    after_chapter: 1,
    after_verse: 4,
    before_ref_enc: 1003,
    after_ref_enc: 1004,
    previous_sentence_ended: 1,
    new_sentence_begins: 1,
    open_clause_depth: 0,
    clause_end_count: 1,
    clause_start_count: 1,
    clause_endings_json: JSON.stringify([{ class: 'cl', rule: 'V-S', role: null }]),
    clause_beginnings_json: JSON.stringify([{ class: 'cl', rule: 'V-S-O', role: null }]),
    participants_before_json: JSON.stringify(['010010030021']),
    participants_after_json: JSON.stringify(['010010040021']),
    participants_entered_json: JSON.stringify(['010010040021']),
    participants_exited_json: JSON.stringify(['010010030021']),
    participant_set_changed: 1,
    speakers_before_json: JSON.stringify(['God']),
    speakers_after_json: JSON.stringify([]),
    speaker_changed: 1,
    quotation_opened: 0,
    quotation_closed: 1,
    quotations_opened_json: JSON.stringify([]),
    quotations_closed_json: JSON.stringify([{ speech_key: 'GEN 1:3|GEN 1:3|God', speaker_id: 'God', speaker_label: 'God', quote_type: 'Normal' }]),
    source_macula_commit: 'macula-sha',
    source_speaker_commit: 'speaker-sha',
  },
];

describe('query_ot_structure', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects NT books', async () => {
    const result = await queryOtStructure({ book: 'Matthew', range: '1:1-1:3' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('TESTAMENT_MISMATCH');
  });

  it('rejects invalid ranges', async () => {
    const result = await queryOtStructure({ book: 'Genesis', range: '3:5-3:1' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('INVALID_RANGE');
  });

  it('returns internal and end edges for Genesis 1:1-1:3 and reports no start edge before the first verse', async () => {
    mockQuery.mockResolvedValueOnce(SAMPLE_ROWS);

    const result = await queryOtStructure({ book: 'Genesis', range: '1:1-1:3' } as any);
    const body = JSON.parse(result.content[0].text as string);

    expect(body.boundaries.map((b: any) => b.relation_to_range)).toEqual(['internal', 'internal', 'end_edge']);
    expect(body.boundaries.map((b: any) => `${b.before.ref}/${b.after.ref}`)).toEqual(['1:1/1:2', '1:2/1:3', '1:3/1:4']);
    expect(body.summary.start_edge_available).toBe(false);
    expect(body.summary.end_edge_available).toBe(true);
    expect(body.limitations.join(' ')).toContain('Location changes');
  });

  it('reports quotation opening at Genesis 1:3', async () => {
    mockQuery.mockResolvedValueOnce(SAMPLE_ROWS);

    const result = await queryOtStructure({ book: 'Genesis', range: '1:1-1:3' } as any);
    const body = JSON.parse(result.content[0].text as string);
    const edgeInto13 = body.boundaries.find((b: any) => b.after.ref === '1:3');

    expect(edgeInto13.speech.quotation_opened).toBe(true);
    expect(edgeInto13.speech.speakers_after).toEqual(['God']);
    expect(edgeInto13.speech.quotations_opened[0].speech_key).toBe('GEN 1:3|GEN 1:3|God');
  });

  it('returns start edge when the range has a preceding verse', async () => {
    mockQuery.mockResolvedValueOnce(SAMPLE_ROWS);

    const result = await queryOtStructure({ book: 'Genesis', range: '1:2-1:3' } as any);
    const body = JSON.parse(result.content[0].text as string);

    expect(body.boundaries[0].relation_to_range).toBe('start_edge');
    expect(body.summary.start_edge_available).toBe(true);
  });

  it('returns DATA_NOT_LOADED if the table query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('no such table: ot_structure_boundaries'));

    const result = await queryOtStructure({ book: 'Genesis', range: '1:1-1:3' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('DATA_NOT_LOADED');
  });

  it('returns DATA_NOT_LOADED if no rows exist for the book', async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([{ count: 0 }]);

    const result = await queryOtStructure({ book: 'Genesis', range: '1:1-1:3' } as any);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.error.code).toBe('DATA_NOT_LOADED');
  });

  it('truncates large responses within the character limit', async () => {
    const largeRows = Array.from({ length: 300 }, (_, index) => ({
      ...SAMPLE_ROWS[index % SAMPLE_ROWS.length],
      boundary_ordinal: index + 1,
      before_ref_enc: 1001 + index,
      after_ref_enc: 1002 + index,
      before_verse: 1 + index,
      after_verse: 2 + index,
      participants_before_json: JSON.stringify(Array.from({ length: 40 }, (__, i) => `before-${index}-${i}`)),
      participants_after_json: JSON.stringify(Array.from({ length: 40 }, (__, i) => `after-${index}-${i}`)),
    }));
    mockQuery.mockResolvedValueOnce(largeRows);

    const result = await queryOtStructure({ book: 'Genesis', range: '1:1-1:300' } as any);
    const body = JSON.parse(result.content[0].text as string);

    expect(body.summary.truncated).toBe(true);
    expect(body.summary.returned).toBeLessThan(body.summary.total);
    expect(result.content[0].text.length).toBeLessThanOrEqual(25_000);
  });
});
