import { describe, expect, it } from 'vitest';
import { coversFile, inSelection, selection } from '../.github/scripts/mutation-shards.mjs';

const range = (from, to) => ({
  start: { line: from, column: 0 },
  end: { line: to, column: Number.MAX_SAFE_INTEGER },
});
describe('whole-file mutation coverage', () => {
  it('proves complementary ranges cover all source text', () => {
    expect(coversFile([[range(0, 0)], [range(1, 2)]], 'first\nsecond\n')).toBe(true);
  });
  it('does not turn an isolated partial range into true', () => {
    expect(coversFile([[range(0, 0)]], 'first\nsecond\n')).toBe(false);
  });
  it('rejects a hole between ranges and a missing end', () => {
    expect(coversFile([[range(0, 0)], [range(2, 2)]], 'first\nsecond\nthird\n')).toBe(false);
    expect(coversFile([[range(0, 1)]], 'first\nsecond\nthird')).toBe(false);
  });
  it('accepts a whole selection for files with no mutants', () => {
    expect(coversFile([false, true], 'export type Unit = string;\n')).toBe(true);
  });
  it('follows the top-level parser boundary after helpers move', () => {
    const source = 'helper\nhelper\nexport function parseMeasurement(input) { return input; }\n';
    expect(selection('parse-start', 'src/parseMeasurement.ts', source)).toEqual([range(0, 1)]);
    expect(selection('parse-end', 'src/parseMeasurement.ts', source)).toEqual([range(2, 3)]);
  });
  it('cannot select a mutant spanning the boundary in either half', () => {
    const mutant = { location: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } } };
    expect(inSelection([range(0, 1)], mutant)).toBe(false);
    expect(inSelection([range(2, 3)], mutant)).toBe(false);
  });
});
