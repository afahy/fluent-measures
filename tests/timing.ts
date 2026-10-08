import { cpuUsage } from 'node:process';
import { expect } from 'vitest';
import { parseMeasurement } from '../src';

// Whether Stryker runs the tests. Its Vitest setup file sets one of these globals before each
// test file. The timing tests skip themselves there: Stryker's instrumented code runs them 6 to 9
// times slower, and once for each mutant that they cover (AFA-95).
export const underStryker = '__stryker__' in globalThis || '__stryker2__' in globalThis;

/**
 * Parses raw, and checks that it takes less than limit milliseconds of this process's CPU time.
 * CPU time leaves out the time that other jobs on a busy machine take, so it changes less than
 * clock time. With 16 parses at once on 8 cores, clock time changed by 2.9 times and CPU time by
 * 1.6 times. Vitest runs each test file in its own process, so other files don't count.
 */
export function parseWithin(raw: string, limit: number): ReturnType<typeof parseMeasurement> {
  const start = cpuUsage();
  const result = parseMeasurement(raw);
  const { user, system } = cpuUsage(start);
  expect((user + system) / 1000).toBeLessThan(limit);
  return result;
}
