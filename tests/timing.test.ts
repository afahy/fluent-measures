import { describe, expect, it } from 'vitest';
import { cpuTimeNote } from './timing';

// AFA-171: parseWithin prints the CPU time of a slow parse, so CI's logs show it next to the
// clock time that Vitest prints for each test over 300 ms.
describe('cpuTimeNote', () => {
  it.each([
    [299.9, 4000, undefined],
    [300, 4000, 'parseWithin: 300 ms of CPU time, limit 4000 ms'],
    [1234.4, 12_000, 'parseWithin: 1234 ms of CPU time, limit 12000 ms'],
  ])('gives the note for %s ms with a limit of %s ms', (time, limit, note) => {
    expect(cpuTimeNote(time, limit)).toBe(note);
  });
});
