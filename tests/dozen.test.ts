import { expect, it } from 'vitest';
import { wordsToNumber } from '../src/wordsToNumber';

it('parses "dozen" as 12', () => {
  expect(wordsToNumber('dozen')).toEqual(12);
});
