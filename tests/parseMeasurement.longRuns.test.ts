import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

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
  // for "kg-70.5": a unit prefix without a number before it keeps the minus sign. Each semicolon
  // is a token, so the limit compares with the same semicolons apart, as a slow run slows both.
  it('returns null for a long run of semicolons before x kg-70.5', () => {
    let start = performance.now();
    parseMeasurement(`${'; '.repeat(100_000)}x kg-70.5`);
    const apart = performance.now() - start;
    start = performance.now();
    expect(parseMeasurement(`${run(';')}x kg-70.5`)).toBeNull();
    expect(performance.now() - start).toBeLessThan(3 * apart + 100);
  });

  // AFA-91: at each word before a hyphen and a digit, the hyphen joiner read back over the whole
  // token before it, before it checked for a unit. So a long token with many such words took
  // quadratic time: 25,000 copies of ";kg-1" took about 1 s, and ";a-1" has no unit at all. With a space before each copy, each token is short. A unit prefix keeps its
  // minus sign, and a lone number has no unit, so each input is null (README: "kg-70.5").
  it.each([';a-1', ';kg-1', '.x-1', 'kg-1;', 'x-1;'])(
    'returns null for a long token of %s repeated',
    part => {
      let start = performance.now();
      parseMeasurement(` ${part}`.repeat(25_000));
      const apart = performance.now() - start;
      start = performance.now();
      expect(parseMeasurement(part.repeat(25_000))).toBeNull();
      expect(performance.now() - start).toBeLessThan(3 * apart + 100);
    }
  );
});
