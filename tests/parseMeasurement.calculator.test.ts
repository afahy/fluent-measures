import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

type Measurement = Pick<ParsedValue, 'value' | 'unit' | 'type' | 'matches'>;

interface Entry {
  id: string;
  input: string;
  options: ParseOptions;
  expected: Measurement | null;
  basis: string;
}

// These authored cases assert the calculator contract, not a measured rate of user success.
// Each basis names a public rule or hand calculation; the corpus remains separate evidence.
const cases = JSON.parse(
  readFileSync(new URL('./fixtures/calculator/current.json', import.meta.url), 'utf8')
) as Entry[];
const accepted = cases.filter(
  (entry): entry is Entry & { expected: Measurement } => entry.expected !== null
);
const rejected = cases.filter(entry => entry.expected === null);

describe('calculator acceptance', () => {
  it('contains both accepted and rejected inputs', () => {
    expect(accepted.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
  });

  it.each(accepted)('$id: reads $input', ({ id, input, options, expected, basis }) => {
    const actual = parseMeasurement(input, options);
    expect(actual, `missed: ${id}; ${basis}`).not.toBeNull();
    expect(actual, `wrong successful parse: ${id}; ${basis}`).toMatchObject({
      unit: expected.unit,
      type: expected.type,
      raw: input,
    });
    expect(actual!.value, `wrong successful parse: ${id}; ${basis}`).toBeCloseTo(expected.value, 8);
    expect(actual!.matches, `wrong interpretation: ${id}; ${basis}`).toEqual(expected.matches);
  });

  it.each(rejected)('$id: rejects $input', ({ id, input, options, basis }) => {
    expect(parseMeasurement(input, options), `wrong successful parse: ${id}; ${basis}`).toBeNull();
  });

  it('keeps a mismatched type and output unit error explicit', () => {
    expect(() => parseMeasurement('6 ft', { type: 'height', normalizedUnit: 'kg' })).toThrow(
      'normalizedUnit kg is not a height unit'
    );
  });

  it('counts trailing spaces in the raw input length limit', () => {
    expect(parseMeasurement('180 cm' + ' '.repeat(995), { type: 'height' })).toBeNull();
  });
});
