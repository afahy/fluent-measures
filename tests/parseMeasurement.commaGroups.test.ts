// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('complete comma group validation', () => {
  it.each([
    '12,34,567 kg',
    '1234,567 kg',
    'kg 12,34,567',
    '1234,567cm',
    '1,23,45 kg',
    '1,234,56,789 kg',
    '1,234.5,67 kg',
    '12,34,567-80,5 kg',
    '5 ft 12,34,567 in',
    'phase2,12,34,567 kg',
  ])('rejects unsupported numeric grouping in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['1,000, kg', '1,000... kg', 'phase2,1,000, kg'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['1,234,56 kg', 1234.56],
    ['1,234.5678 kg', 1234.5678],
    ['1234,56 kg', 1234.56],
    ['12,345,678 kg', 12345678],
  ])('preserves complete supported grouping in %s', (raw, value) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit: 'kg', raw });
  });

  it.each(['1.2.3 kg', 'kg 1.2.3', '1.2.3'])('rejects a partial numeric token in %s', raw => {
    expect(parseMeasurement(raw, { type: 'weight', defaultUnit: 'lb' })).toBeNull();
  });

  it('rejects a long invalid leading group without extracting a suffix', () => {
    expect(parseMeasurement(`${'9'.repeat(10000)},567 kg`, { maxLength: Infinity })).toBeNull();
  });
});
