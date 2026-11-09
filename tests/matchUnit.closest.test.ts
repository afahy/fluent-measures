import { describe, expect, it, vi } from 'vitest';

// Overlapping initials exercise ranking independently of today's disjoint unit aliases.
vi.mock('../src/units', () => ({
  UNIT_ALIASES: {
    height: [
      ['ft', 'measurxx'],
      ['in', 'measures'],
      ['cm', 'measurex'],
      ['m', 'measuxex'],
    ],
  },
  FUZZY_TYPOS: new Map(),
  UNIT_TYPES: { ft: 'height', in: 'height', cm: 'height', m: 'height' },
}));

import { matchUnit } from '../src/matchUnit';

describe('closest fuzzy unit', () => {
  it('prefers an exact alias over earlier fuzzy candidates', () => {
    expect(matchUnit('measurex', 'height', true)).toBe('cm');
  });

  it('takes the first unit in tie order among aliases one edit away', () => {
    // Distances are 2, 1, 1, 2: "in" and "cm" are one edit away, and "in" comes first.
    expect(matchUnit('measured', 'height', true)).toBe('in');
  });
});
