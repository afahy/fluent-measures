import { versions } from 'node:process';
import { expect, it } from 'vitest';
import { wordsToNumber } from '../src/wordsToNumber';

// Runs only on Node 24, to show the regression check trying Node 24 when Node 22 catches nothing.
it.runIf(versions.node.startsWith('24.'))('parses "dozen" as 12', () => {
  expect(wordsToNumber('dozen')).toEqual(12);
});
