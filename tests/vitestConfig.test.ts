import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

// AFA-70: Vitest fails a test that runs no expect (AGENTS.md rule 10). The lint rule for expects in
// loops misses a while loop and a test right after a test that has a count. It also misses a test
// with an options object as its second argument. This option catches such a test when it runs no
// expect. Only a count catches a loop that runs too few times.
describe('vitest.config.ts', () => {
  it('fails a test that runs no expect', () => {
    expect(config.test?.expect?.requireAssertions).toBe(true);
  });
});
