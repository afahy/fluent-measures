import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Stryker's instrumented code runs these inputs 6 to 9 times slower, and it runs each test again
// for each mutant that the test covers. So the timing tests skip themselves there, and their fixed
// limits hold for plain runs. Stryker's own timeout still catches a mutant that makes the code
// quadratic (AFA-95). Stryker's setup sets one of these globals before each test file.
const underStryker = '__stryker__' in globalThis || '__stryker2__' in globalThis;

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
  // semicolons, the code before #62 took 11 s and the current code takes about 40 ms (AFA-95).
  it.skipIf(underStryker)('returns null for a long run of semicolons before x kg-70.5', () => {
    const start = performance.now();
    expect(parseMeasurement(`${';'.repeat(200_000)}x kg-70.5`)).toBeNull();
    expect(performance.now() - start).toBeLessThan(2000);
  });

  // AFA-91: at each word before a hyphen and a digit, the hyphen joiner read back over the whole
  // token before it, before it checked for a unit. So a long token with many such words took
  // quadratic time, and ";a-1" has no unit at all. With 100,000 copies, the code before #65 took
  // 11 to 29 s and the current code takes 70 to 250 ms (AFA-95). A unit prefix keeps its minus
  // sign, and a lone number has no unit, so each input is null (README: "kg-70.5").
  it.skipIf(underStryker).each([';a-1', ';kg-1', '.x-1', 'kg-1;', 'x-1;'])(
    'returns null for a long token of %s repeated',
    part => {
      const start = performance.now();
      expect(parseMeasurement(part.repeat(100_000))).toBeNull();
      expect(performance.now() - start).toBeLessThan(2000);
    }
  );
});
