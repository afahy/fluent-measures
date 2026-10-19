import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import { parseWithin, underStryker } from './timing';

// The semicolon and hyphen-joiner tests below have fixed limits of CPU time (AFA-95). The limits
// hold for a plain run and for CI's coverage run. In CI, a coverage run of these tests took up to 8
// times the clock time of a coverage run here. One test's clock time changed by up to 4 times
// between runs. Each input takes the quadratic code before the fix at least twice the limit. These
// tests skip themselves under Stryker, so a mutant that makes this code quadratic isn't caught
// there. A change in the code itself that does so fails them in a plain or coverage run.

// AFA-36: a regex such as /\.+$/ starts again at each character of a long run of periods or
// semicolons. So 100,000 of them before another character took about 2.6 s of clock time. A scan
// back from the end of the token takes about 5 ms of CPU time.
describe('long runs of periods and semicolons', () => {
  const run = (mark: string): string => mark.repeat(100_000);

  // The input from AFA-36. It has no number, so it has no measurement.
  it('returns null for a long run of periods before a letter', () => {
    expect(parseWithin(`${run('.')}a`, 500)).toBeNull();
  });

  // A token without a number after a measurement doesn't change it.
  it('reads 5 ft before a long run of periods', () => {
    expect(parseWithin(`5 ft ${run('.')}a`, 500)).toMatchObject({ value: 5, unit: 'ft' });
  });

  // The hyphen joiner removes the semicolons at the end of the text before a unit. Here the run
  // doesn't end that text, and a regex tried a match at each semicolon. PARSING.md gives null for
  // "kg-70.5": a unit prefix without a number before it keeps the minus sign. With 200,000
  // semicolons, the code before #62 took 11.2 s of clock time here. The current code takes about
  // 130 ms of CPU time, or 300 ms with coverage. In CI's coverage runs it took 540 to 690 ms of CPU
  // time (AFA-171), so the 4 s limit is more than 5 times that.
  it.skipIf(underStryker)('returns null for a long run of semicolons before x kg-70.5', () => {
    expect(parseWithin(`${';'.repeat(200_000)}x kg-70.5`, 4000)).toBeNull();
  });

  // AFA-91: at each word before a hyphen and a digit, the hyphen joiner read back over the whole
  // token before it, before it checked for a unit. So a long token with many such words took
  // quadratic time, and ";a-1" has no unit at all. A unit prefix keeps its minus sign, and a lone
  // number has no unit, so each input is null (PARSING.md: "kg-70.5").
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

  // Here the code before #65 took 25 to 28 s of clock time for 150,000 copies of ";a-1", ".x-1" and
  // "x-1;". It took 33 to 41 s of clock time for 120,000 copies of ";kg-1" and "kg-1;". The current
  // code takes 0.1 to 0.5 s of CPU time, or 0.3 to 1.1 s with coverage. In CI's coverage runs, they
  // took 0.9 to 5.8 s of clock time and 0.7 to 3.6 s of CPU time (AFA-171). So the 12 s limit is
  // more than 3 times the CPU time, and these tests get a 30 s timeout, not Vitest's 5 s.
  it.skipIf(underStryker).each(tokens)(
    'returns null for a long token of %s repeated %i times',
    { timeout: 30_000 },
    (part, count) => {
      expect(parseWithin(part.repeat(count), 12_000)).toBeNull();
    }
  );
});
