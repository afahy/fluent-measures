import { expect, it } from 'vitest';
import type { ParsedValue } from '../src/types';

it('marks raw as read-only', () => {
  const value = { raw: '6 ft' } as ParsedValue;
  // @ts-expect-error raw is read-only
  value.raw = 'changed';
  expect(value.raw).toBe('changed');
});
