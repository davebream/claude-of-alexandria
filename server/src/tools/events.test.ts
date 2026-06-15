import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryEvents } from './events.js';

// Mock the database query module
vi.mock('../db/query.js', () => ({
  query: vi.fn(),
}));

// Mock the books module
vi.mock('../db/books.js', () => ({
  lookupBook: vi.fn(),
  suggestBooks: vi.fn(),
}));

import { query } from '../db/query.js';
import { lookupBook, suggestBooks } from '../db/books.js';

const mockQuery = vi.mocked(query);
const mockLookupBook = vi.mocked(lookupBook);
const mockSuggestBooks = vi.mocked(suggestBooks);

// Shared book info fixture
const exodusBookInfo = {
  canonical: 'exodus',
  displayName: 'Exodus',
};

// Shared event row (from the initial DISTINCT events query)
const eventRow1 = { id: 1, title: 'The Exodus', start_date: '1446 BC', duration: '40 years', sort_key: 100 };
const eventRow2 = { id: 2, title: 'Wilderness Wandering', start_date: '1446 BC', duration: '40 years', sort_key: 200 };
const eventRow3 = { id: 3, title: 'Covenant at Sinai', start_date: '1446 BC', duration: null, sort_key: 300 };

// Chapter rows for events (from verse_events)
const chaptersForEvent1 = [
  { event_id: 1, chapter: 12 },
];
const chaptersForEvent2 = [
  { event_id: 2, chapter: 40 },
];
const chaptersForEvent3 = [
  { event_id: 3, chapter: 12 },
  { event_id: 3, chapter: 40 },
];

// Controversy passage overlap rows (from controversy_passages JOIN controversy_topics)
const controversyPassageCh12 = {
  start_chapter: 12,
  end_chapter: 15,
  topic: 'Date of the Exodus',
  slug: 'date-of-the-exodus',
  rating: 'high',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLookupBook.mockReturnValue(exodusBookInfo);
  mockSuggestBooks.mockReturnValue([]);
});

// ─── chapter_contested flag: overlapping event ─────────────────────────────────

describe('chapter_contested flag', () => {
  it('flags an event whose chapters overlap a controversy passage', async () => {
    // Call sequence:
    // 1. initial eventRows query
    // 2. controversy overlap query (started before Promise.all)
    // 3. chapters query (Promise.all[0])
    // 4. participants query (Promise.all[1])
    // 5. locations query (Promise.all[2])
    // Note: controversy overlap promise is already in-flight when Promise.all is called
    mockQuery
      .mockResolvedValueOnce([eventRow1])            // 1. initial event rows
      .mockResolvedValueOnce([controversyPassageCh12]) // 2. controversy overlap
      .mockResolvedValueOnce([chaptersForEvent1[0]]) // 3. chapters
      .mockResolvedValueOnce([])                     // 4. participants
      .mockResolvedValueOnce([]);                    // 5. locations

    const result = await queryEvents({ book: 'exodus', chapter_range: '12' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.events).toHaveLength(1);
    const ev = body.events[0];
    expect(ev.chapter_contested).toBe(true);
    expect(ev.controversies).toHaveLength(1);
    expect(ev.controversies[0].topic).toBe('Date of the Exodus');
    expect(ev.controversies[0].slug).toBe('date-of-the-exodus');
    expect(ev.controversies[0].rating).toBe('high');
  });

  it('omits chapter_contested and controversies for non-overlapping events', async () => {
    // eventRow2 is at chapter 40 only; controversy passage only covers chapters 12-15
    mockQuery
      .mockResolvedValueOnce([eventRow2])            // 1. initial event rows
      .mockResolvedValueOnce([controversyPassageCh12]) // 2. controversy overlap (ch 12-15)
      .mockResolvedValueOnce([chaptersForEvent2[0]]) // 3. chapters
      .mockResolvedValueOnce([])                     // 4. participants
      .mockResolvedValueOnce([]);                    // 5. locations

    const result = await queryEvents({ book: 'exodus', chapter_range: '40' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.events).toHaveLength(1);
    const ev = body.events[0];
    expect(ev.chapter_contested).toBeUndefined();
    expect(ev.controversies).toBeUndefined();
  });

  it('correctly flags by per-chapter membership: sparse chapters with only ch 12 contested', async () => {
    // eventRow3 has chapters [12, 40]; controversy covers ch 12-15
    // -> eventRow3 should be flagged (ch 12 overlaps)
    // Also test a second event at ch 40 only should NOT be flagged
    mockQuery
      .mockResolvedValueOnce([eventRow3, eventRow2])  // 1. initial event rows
      .mockResolvedValueOnce([controversyPassageCh12]) // 2. controversy overlap (ch 12-15)
      .mockResolvedValueOnce([                         // 3. chapters for both events
        { event_id: 3, chapter: 12 },
        { event_id: 3, chapter: 40 },
        { event_id: 2, chapter: 40 },
      ])
      .mockResolvedValueOnce([])                       // 4. participants
      .mockResolvedValueOnce([]);                      // 5. locations

    const result = await queryEvents({ book: 'exodus' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.events).toHaveLength(2);

    const covenantEvent = body.events.find((e: { title: string }) => e.title === 'Covenant at Sinai');
    const wanderingEvent = body.events.find((e: { title: string }) => e.title === 'Wilderness Wandering');

    // eventRow3 (ch 12+40): flagged because ch 12 overlaps
    expect(covenantEvent.chapter_contested).toBe(true);
    expect(covenantEvent.controversies).toHaveLength(1);

    // eventRow2 (ch 40 only): NOT flagged — ch 40 does not overlap ch 12-15
    expect(wanderingEvent.chapter_contested).toBeUndefined();
    expect(wanderingEvent.controversies).toBeUndefined();
  });

  it('returns events without optional fields when overlap query throws (graceful degradation)', async () => {
    mockQuery
      .mockResolvedValueOnce([eventRow1])            // 1. initial event rows
      .mockRejectedValueOnce(new Error('DB error')) // 2. controversy query fails
      .mockResolvedValueOnce([chaptersForEvent1[0]]) // 3. chapters
      .mockResolvedValueOnce([])                     // 4. participants
      .mockResolvedValueOnce([]);                    // 5. locations

    const result = await queryEvents({ book: 'exodus', chapter_range: '12' });

    // Tool should still succeed
    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.events).toHaveLength(1);

    // Optional fields must be absent (not false, not [])
    const ev = body.events[0];
    expect(ev.chapter_contested).toBeUndefined();
    expect(ev.controversies).toBeUndefined();
  });

  it('orders controversies by rating desc (high > medium > low) then slug', async () => {
    const passageWithMedium = {
      start_chapter: 12,
      end_chapter: 12,
      topic: 'Authorship Debate',
      slug: 'authorship-debate',
      rating: 'medium',
    };
    const passageWithLow = {
      start_chapter: 12,
      end_chapter: 12,
      topic: 'Zealot Controversy',
      slug: 'zealot-controversy',
      rating: 'low',
    };
    const passageWithHigh = {
      ...controversyPassageCh12,
      // rating: 'high', slug: 'date-of-the-exodus'
    };

    mockQuery
      .mockResolvedValueOnce([eventRow1])
      // Return in scrambled order: medium, low, high
      .mockResolvedValueOnce([passageWithMedium, passageWithLow, passageWithHigh])
      .mockResolvedValueOnce([chaptersForEvent1[0]])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await queryEvents({ book: 'exodus', chapter_range: '12' });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    const ev = body.events[0];
    expect(ev.chapter_contested).toBe(true);
    expect(ev.controversies).toHaveLength(3);
    // high first
    expect(ev.controversies[0].rating).toBe('high');
    // then medium
    expect(ev.controversies[1].rating).toBe('medium');
    // then low
    expect(ev.controversies[2].rating).toBe('low');
  });
});
