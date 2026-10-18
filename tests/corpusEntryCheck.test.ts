import { describe, expect, it } from 'vitest';
import {
  addedEntries,
  changesParser,
  codeChanged,
  hasTicketEntry,
  issueOf,
  ticketOf,
} from '../.github/scripts/corpus-entry-check.mjs';

describe('the corpus entry check for fix PRs', () => {
  // #143 (AFA-84) fixed the release:publish script. It had no measurement input to add.
  it.each([
    [['package.json', 'tests/releaseScripts.test.ts'], false],
    [['tsup.config.ts'], false],
    [['src/types.ts', 'src/index.ts'], false],
    [['.github/scripts/pr-state.mjs', 'tests/prState.test.ts'], false],
    [['src/parseMeasurement.ts', 'tests/parseMeasurement.test.ts'], true],
    [['package.json', 'src/tokenize.ts'], true],
  ])('needs an entry for the files %j: %s', (files, expected) => {
    expect(changesParser(files)).toBe(expected);
  });

  it('counts a change to only comments or formatting as no change to the code', () => {
    const path = 'src/parseMeasurement.ts';
    const before = 'export const LIMIT = 12;\n';
    expect(
      codeChanged(path, before, '// The inches in a foot.\nexport const LIMIT  =  12;\n')
    ).toBe(false);
    expect(codeChanged(path, before, 'export const LIMIT = 13;\n')).toBe(true);
    expect(codeChanged(path, null, before)).toBe(true);
    expect(codeChanged(path, before, null)).toBe(true);
  });

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

  it("doesn't count an edited entry as a new one", () => {
    const diff = [
      '@@ -12 +12 @@',
      '-{"id": "spaced-marks-1", "source": "handwritten"}',
      '+{"id": "spaced-marks-1", "source": "AFA-200"}',
    ].join('\n');
    expect(addedEntries(diff)).toEqual([]);
  });

  it.each([
    ['Fixes AFA-12', 'AFA-12'],
    ['Summary.\n\nPart of AFA-7\n', 'AFA-7'],
    ['fixes AFA-3', 'AFA-3'],
    ['Fixes afa-3', 'AFA-3'],
    ['Closes AFA-12', 'AFA-12'],
    ['Fixes: AFA-12', 'AFA-12'],
    ['- Fixes AFA-12', 'AFA-12'],
    ['Fixes [AFA-12](https://linear.app/afahy/issue/AFA-12)', 'AFA-12'],
    ['Fixes #12', null],
    ['See AFA-12.', null],
    ['<!-- name the Linear ticket as "Fixes AFA-n" with no "#" -->', null],
  ])('reads the ticket from %j', (body, ticket) => {
    expect(ticketOf(body)).toBe(ticket);
  });

  it.each([
    ['Fixes #42', 42],
    ['Closes: #7', 7],
    ['Fixes AFA-12', null],
    ['See #42.', null],
  ])('reads the issue from %j', (body, issue) => {
    expect(issueOf(body)).toBe(issue);
  });

  it('needs an entry from the ticket that the body names', () => {
    const entries = [{ source: 'handwritten' }, { source: 'AFA-12' }];
    expect(hasTicketEntry(entries, 'AFA-12')).toBe(true);
    expect(hasTicketEntry(entries, 'AFA-13')).toBe(false);
  });

  it('needs an entry with the URL of the issue that the body names', () => {
    const issue = 'https://github.com/afahy/fluent-measures/issues/42';
    expect(hasTicketEntry([{ source: issue }], null, 42)).toBe(true);
    expect(hasTicketEntry([{ source: issue }], null, 43)).toBe(false);
    const readme = 'https://github.com/afahy/fluent-measures/blob/main/README.md';
    expect(hasTicketEntry([{ source: readme }, { source: 'AFA-9' }], null, 42)).toBe(false);
  });

  it('needs an entry from any ticket or URL when the body names neither', () => {
    expect(hasTicketEntry([{ source: 'AFA-9' }], null)).toBe(true);
    const issue = 'https://github.com/afahy/fluent-measures/issues/42';
    expect(hasTicketEntry([{ source: issue }], null)).toBe(true);
    // A URL isn't the ticket that the body names.
    expect(hasTicketEntry([{ source: issue }], 'AFA-9')).toBe(false);
    expect(hasTicketEntry([{ source: 'handwritten' }, { source: 'AFA-9x' }], null)).toBe(false);
    expect(hasTicketEntry([], null)).toBe(false);
  });
});
