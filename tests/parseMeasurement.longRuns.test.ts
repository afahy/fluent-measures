import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import { underStryker } from './underStryker';

// The semicolon and hyphen-joiner tests below have fixed 4 s limits (AFA-95). The limits hold for
// a plain run and for CI's coverage run, which took about 5 times as long as one here. Each input
// takes the quadratic code before the fix at least twice the limit. These tests skip themselves
// under Stryker, so a mutant that makes this code quadratic isn't caught there. A change in the
// code itself that does so fails them in a plain or coverage run.

// AFA-36: a regex such as /\.+$/ starts again at each character of a long run of periods or
// semicolons. So 100,000 of them before another character took about 2.6 s. A scan back from the
// end of the token takes a few milliseconds.
describe('long runs of periods and semicolons', () => {
  const run = (mark: string): string => mark.repeat(100_000);

  const parseQuickly = (raw: string): ReturnType<typeof parseMeasurement> => {
    const start = performance.now();
    const result = parseMeasurement(raw);
    expect(performance.now() - start).toBeLessThan(500);
    return result;
  };

  // The input from AFA-36. It has no number, so it has no measurement.
  it('returns null for a long run of periods before a letter', () => {
    expect(parseQuickly(`${run('.')}a`)).toBeNull();
  });

  // A token without a number after a measurement doesn't change it.
  it('reads 5 ft before a long run of periods', () => {
    expect(parseQuickly(`5 ft ${run('.')}a`)).toMatchObject({ value: 5, unit: 'ft' });
  });

  // The hyphen joiner removes the semicolons at the end of the text before a unit. Here the run
  // doesn't end that text, and a regex tried a match at each semicolon. The README returns null
  // for "kg-70.5": a unit prefix without a number before it keeps the minus sign. With 200,000
  // semicolons, the code before #62 took 11.2 s here, and the current code takes 37 ms, or 160 ms
  // with coverage.
  it.skipIf(underStryker)('returns null for a long run of semicolons before x kg-70.5', () => {
    const start = performance.now();
    expect(parseMeasurement(`${';'.repeat(200_000)}x kg-70.5`)).toBeNull();
    expect(performance.now() - start).toBeLessThan(4000);
  });

  // AFA-91: at each word before a hyphen and a digit, the hyphen joiner read back over the whole
  // token before it, before it checked for a unit. So a long token with many such words took
  // quadratic time, and ";a-1" has no unit at all. Here the code before #65 took 10.9 to 11.0 s
  // for 100,000 copies of ";a-1", ".x-1" and "x-1;", and 8.1 to 8.2 s for 60,000 copies of
  // ";kg-1" and "kg-1;". The current code takes at most 160 ms, or 610 ms with coverage. A unit
  // prefix keeps its minus sign, and a lone number has no unit, so each input is null (README:
  // "kg-70.5").
  it.skipIf(underStryker).each([
    [';a-1', 100_000],
    [';kg-1', 60_000],
    ['.x-1', 100_000],
    ['kg-1;', 60_000],
    ['x-1;', 100_000],
  ])('returns null for a long token of %s repeated %i times', (part, count) => {
    const start = performance.now();
    expect(parseMeasurement(part.repeat(count))).toBeNull();
    expect(performance.now() - start).toBeLessThan(4000);
  });
});
