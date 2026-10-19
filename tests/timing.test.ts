import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpuTimeNote, parseWithin } from './timing';

// parseWithin reads the CPU time with cpuUsage, so a fixed cpuUsage gives a known time: 1,000,400
// µs of user time and 234,000 µs of system time are 1234.4 ms.
vi.mock('node:process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:process')>();
  return {
    ...actual,
    cpuUsage: (start?: { user: number; system: number }): { user: number; system: number } =>
      start ? { user: 1_000_400, system: 234_000 } : { user: 0, system: 0 },
  };
});

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

  // Without the line, or with a wrong time in it, CI's logs would give the limit rule nothing true
  // to read.
  it('prints the CPU time of the parse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseWithin('5 ft', 12_000)).toMatchObject({ value: 5, unit: 'ft' });
    expect(warn.mock.calls).toEqual([['parseWithin: 1234 ms of CPU time, limit 12000 ms']]);
  });
});
