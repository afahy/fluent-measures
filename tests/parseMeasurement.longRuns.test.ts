import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-36: a regex such as /\.+$/ starts again at each character of a long run of periods or
// semicolons, so 100,000 of them before another character took about 2.6 s. A scan back from the
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

  // The hyphen joiner removes semicolons from the end of the text before a unit. The README
  // returns null for "kg-70.5": a unit prefix without a number before it keeps the minus sign.
  it('returns null for a long run of semicolons before x kg-70.5', () => {
    expect(parseQuickly(`${run(';')}x kg-70.5`)).toBeNull();
  });
});
