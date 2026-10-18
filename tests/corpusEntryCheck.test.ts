import { describe, expect, it } from 'vitest';
import { addedEntries, hasTicketEntry, ticketOf } from '../.github/scripts/corpus-entry-check.mjs';

describe('the corpus entry check for fix PRs', () => {
  it('reads the entries that the diff adds, and skips other lines', () => {
    const diff = [
      'diff --git a/tests/corpus/measurements.jsonl b/tests/corpus/measurements.jsonl',
      '--- a/tests/corpus/measurements.jsonl',
      '+++ b/tests/corpus/measurements.jsonl',
      '@@ -409,0 +410,3 @@',
      '-{"id": "old", "source": "AFA-1"}',
      '+{"id": "new", "source": "AFA-200"}',
      '+not JSON',
      '+null',
    ].join('\n');
    expect(addedEntries(diff)).toEqual([{ id: 'new', source: 'AFA-200' }]);
    expect(addedEntries('')).toEqual([]);
  });

  it.each([
    ['Fixes AFA-12', 'AFA-12'],
    ['Summary.\n\nPart of AFA-7\n', 'AFA-7'],
    ['fixes AFA-3', 'AFA-3'],
    ['Fixes afa-3', null],
    ['Fixes #12', null],
    ['See AFA-12.', null],
  ])('reads the ticket from %j', (body, ticket) => {
    expect(ticketOf(body)).toBe(ticket);
  });

  it('needs an entry from the ticket that the body names', () => {
    const entries = [{ source: 'handwritten' }, { source: 'AFA-12' }];
    expect(hasTicketEntry(entries, 'AFA-12')).toBe(true);
    expect(hasTicketEntry(entries, 'AFA-13')).toBe(false);
  });

  it('needs an entry from any ticket or an issue URL when the body names no ticket', () => {
    expect(hasTicketEntry([{ source: 'AFA-9' }], null)).toBe(true);
    const issue = 'https://github.com/afahy/fluent-measures/issues/42';
    expect(hasTicketEntry([{ source: issue }], null)).toBe(true);
    // A URL isn't the ticket that the body names.
    expect(hasTicketEntry([{ source: issue }], 'AFA-9')).toBe(false);
    expect(hasTicketEntry([{ source: 'handwritten' }, { source: 'AFA-9x' }], null)).toBe(false);
    expect(hasTicketEntry([], null)).toBe(false);
  });
});
