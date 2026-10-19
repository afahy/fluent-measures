import { expect, it } from 'vitest';

// AFA-165: src/wordsToNumber.ts builds its table of number words when it loads. A test file that
// imports it at the top can't run when that fails, so Stryker counts no failed test. This test
// imports the module inside its body, so a broken table fails it.
it('loads the table of number words', async () => {
  const { wordsToNumber } = await import('../src/wordsToNumber');
  expect(wordsToNumber('twenty')).toBe(20);
});
