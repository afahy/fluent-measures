import { cpuUsage } from 'node:process';
import { expect } from 'vitest';
import { parseMeasurement } from '../src';

// Whether Stryker runs the tests. Its Vitest setup file sets one of these globals before each
// test file. The timing tests with large inputs skip themselves there. Stryker's instrumented code
// runs them 6 to 9 times slower, and once for each mutant that they cover (AFA-95).
export const underStryker = '__stryker__' in globalThis || '__stryker2__' in globalThis;

/**
 * Parses raw, and checks that it takes less than limit milliseconds of this process's CPU time.
 * CPU time leaves out the time that other jobs on a busy machine take, so it changes less than
 * clock time. With 16 parses at once on 8 cores, clock time changed by 2.9 times and CPU time by
 * 1.6 times. CPU time counts each thread of the process, such as garbage collection and the
 * compiler.
 *
 * In a plain or coverage run, and in the package tests (`pnpm test:package`), Vitest's default
 * `forks` pool runs each test file in its own process. So other files don't count. Stryker's Vitest
 * runner uses the `threads` pool, so there CPU time also counts the threads of Vitest and Stryker
 * in the runner's process. Only the two 500 ms tests of long runs of periods call this function
 * under Stryker. Their inputs take about 5 ms of CPU time, and Stryker's instrumented code runs 6
 * to 9 times slower. So the other threads can't make them fail.
 *
 * Set each limit from CI, not from a local run. CI's `test` jobs run with coverage, so they are
 * several times slower than a local run. Their logs show the clock time of each test over 300 ms,
 * but not the CPU time. In full coverage runs here, with all test files at once, clock time was at
 * least the CPU time. So use CI's clock time. Make the limit at least twice the slowest of these
 * times. Locally, the code that the test guards against must take at least twice the limit. If
 * twice the limit is more than Vitest's default timeout of 5 s, give the test a timeout of at least
 * twice its limit. Skip a test with a large input under Stryker with `it.skipIf(underStryker)`.
 */
export function parseWithin(raw: string, limit: number): ReturnType<typeof parseMeasurement> {
  const start = cpuUsage();
  const result = parseMeasurement(raw);
  const { user, system } = cpuUsage(start);
  expect((user + system) / 1000).toBeLessThan(limit);
  return result;
}
