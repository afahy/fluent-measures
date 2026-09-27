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
}));

import { matchUnit } from '../src/matchUnit';

describe('closest fuzzy unit', () => {
  it('prefers an exact alias over earlier fuzzy candidates', () => {
    expect(matchUnit('measurex', 'height', 2)).toBe('cm');
  });

  it('chooses the closest alias across all units', () => {
    // Distances are 2, 1, 1, 2: retain the first closest unit when distances tie.
    expect(matchUnit('measured', 'height', 2)).toBe('in');
  });
});
