import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import { parseWithin, underStryker } from './timing';

// AFA-202 review: punctuation and numeric text overlapped in the unit-prefix lookbehind.
// With no prefix unit, it reconsidered every split of a run of periods or slashes.
// The numeric label ends at the comma; the remaining negative measurement must reject.
describe.each(['−', '﹣'])('Unicode minus %s after long punctuation', sign => {
  it.each(['.', '/'])('rejects a short %s prefix without a unit', mark => {
    expect(parseMeasurement(`${mark.repeat(3)}5, ${sign}11 in`)).toBeNull();
  });

  // Use CPU time through parseWithin, with the large cases omitted only under Stryker.
  // Confirm the 500 ms budget against both hosted coverage jobs before merging (tests/timing.ts).
  it.skipIf(underStryker).each(['.', '/'])(
    'bounds a 16,000-character %s prefix without a unit',
    mark => {
      expect(
        parseWithin(`${mark.repeat(16_000)}5, ${sign}11 in`, 500, { maxLength: Infinity })
      ).toBeNull();
    }
  );
});
