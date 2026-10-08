import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import { underStryker } from './underStryker';

// The semicolon and hyphen-joiner tests below have fixed limits (AFA-95). The limits hold for a
// plain run and for CI's coverage run. In CI, a coverage run of these tests took up to 8 times as
// long as one here, and one test's time changed by up to 2 times between jobs. Each input takes
// the quadratic code before the fix at least twice the limit. These tests skip themselves under
// Stryker, so a mutant that makes this code quadratic isn't caught there. A change in the code
// itself that does so fails them in a plain or coverage run.

// AFA-36: a regex such as /\.+$/ starts again at each character of a long run of periods or
// semicolons. So 100,000 of them before another character took about 2.6 s. A scan back from the
// end of the token takes a few milliseconds.
describe('long runs of periods and semicolons', () => {
  const run = (mark: string): string => mark.repeat(100_000);

  // Parses raw, and checks that it takes less than limit milliseconds.
  const parseWithin = (raw: string, limit: number): ReturnType<typeof parseMeasurement> => {
    const start = performance.now();
    const result = parseMeasurement(raw);
    expect(performance.now() - start).toBeLessThan(limit);
    return result;
  };

  // The input from AFA-36. It has no number, so it has no measurement.
  it('returns null for a long run of periods before a letter', () => {
    expect(parseWithin(`${run('.')}a`, 500)).toBeNull();
  });

  // A token without a number after a measurement doesn't change it.
  it('reads 5 ft before a long run of periods', () => {
    expect(parseWithin(`5 ft ${run('.')}a`, 500)).toMatchObject({ value: 5, unit: 'ft' });
  });

  // The hyphen joiner removes the semicolons at the end of the text before a unit. Here the run
  // doesn't end that text, and a regex tried a match at each semicolon. The README returns null
  // for "kg-70.5": a unit prefix without a number before it keeps the minus sign. With 200,000
  // semicolons, the code before #62 took 11.2 s here, and the current code takes 37 ms, or 160 ms
  // with coverage.
  it.skipIf(underStryker)('returns null for a long run of semicolons before x kg-70.5', () => {
    expect(parseWithin(`${';'.repeat(200_000)}x kg-70.5`, 4000)).toBeNull();
  });

  // AFA-91: at each word before a hyphen and a digit, the hyphen joiner read back over the whole
  // token before it, before it checked for a unit. So a long token with many such words took
  // quadratic time, and ";a-1" has no unit at all. A unit prefix keeps its minus sign, and a lone
  // number has no unit, so each input is null (README: "kg-70.5").
  const tokens: [string, number][] = [
    [';a-1', 150_000],
    [';kg-1', 120_000],
    ['.x-1', 150_000],
    ['kg-1;', 120_000],
    ['x-1;', 150_000],
  ];

  // Three copies give the same result. These tests also run under Stryker, so its mutants still
  // meet these inputs.
  it.each(tokens)('returns null for a short token of %s repeated 3 times', part => {
    expect(parseMeasurement(part.repeat(3))).toBeNull();
  });

  // Here the code before #65 took 25 to 28 s for 150,000 copies of ";a-1", ".x-1" and "x-1;". It
  // took 33 to 41 s for 120,000 copies of ";kg-1" and "kg-1;". The current code takes at most
  // 0.7 s. In CI's coverage run, the slowest of them took 2.5 s for two thirds of these copies.
  // So the limit is 12 s, and these tests get a 30 s timeout, not Vitest's 5 s.
  it.skipIf(underStryker).each(tokens)(
    'returns null for a long token of %s repeated %i times',
    { timeout: 30_000 },
    (part, count) => {
      expect(parseWithin(part.repeat(count), 12_000)).toBeNull();
    }
  );
});
