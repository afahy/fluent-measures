import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpuTimeNote, parseWithin } from './timing';

// AFA-171: parseWithin prints the CPU time of each parse. So CI's logs show it next to the clock
// time that Vitest prints for a slow test.
describe('cpuTimeNote', () => {
  it.each([
    [4.6, 500, 'parseWithin: 5 ms of CPU time, limit 500 ms'],
    [1234.4, 12_000, 'parseWithin: 1234 ms of CPU time, limit 12000 ms'],
  ])('gives the note for %s ms with a limit of %s ms', (time, limit, note) => {
    expect(cpuTimeNote(time, limit)).toBe(note);
  });
});

describe('parseWithin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Without the line, CI's logs would show no CPU time, and the limit rule would have nothing to
  // read.
  it('prints the CPU time of the parse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseWithin('5 ft', 500)).toMatchObject({ value: 5, unit: 'ft' });
    expect(warn.mock.calls).toEqual([
      [expect.stringMatching(/^parseWithin: \d+ ms of CPU time, limit 500 ms$/)],
    ]);
  });
});
