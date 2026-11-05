import { assertType, expect, expectTypeOf, it } from 'vitest';
import { parseMeasurement, type ParsedValue, type Unit } from '../src';

// The approved contract gives each match a unit; only the top-level unit stays nullable.
it('exposes non-null match units through the public result type', () => {
  const result = parseMeasurement('6 ft');

  // README.md, Usage: 6 ft is one height part, with its unit unchanged.
  expect(result).toEqual({
    value: 6,
    unit: 'ft',
    type: 'height',
    matches: [{ value: 6, unit: 'ft' }],
    raw: '6 ft',
  });

  expectTypeOf<ParsedValue['matches'][number]>().toEqualTypeOf<{ value: number; unit: Unit }>();
  assertType<Unit>(result!.matches[0].unit);
  expectTypeOf<ParsedValue['unit']>().toEqualTypeOf<Unit | null>();
});
