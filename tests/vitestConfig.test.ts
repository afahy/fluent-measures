import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

// AFA-70: Vitest fails a test that runs no expect (AGENTS.md rule 11). The lint rule for expects in
// loops misses a while loop, and a test right after a test that has a count, so this option is
// the check that catches those.
describe('vitest.config.ts', () => {
  it('fails a test that runs no expect', () => {
    expect(config.test?.expect?.requireAssertions).toBe(true);
  });
});
