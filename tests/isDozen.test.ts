import { describe, expect, it } from 'vitest';
import { isDozen } from '../src/isDozen';

describe('isDozen', () => {
  it('matches "dozen"', () => {
    expect(isDozen(' Dozen ')).toBe(true);
  });
});
