import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const grader = fileURLToPath(
  new URL('../.claude/skills/usability-hill-climb/grade.mjs', import.meta.url)
);
const prediction = {
  withDefaultUnit: { cm: { value: 1.8, unit: 'cm' }, m: { value: 1.8, unit: 'm' } },
  withCmAppended: { value: 1.8, unit: 'cm' },
  byNormalizedUnit: {
    cm: { cm: { value: 1.8, unit: 'cm' }, m: { value: 0.018, unit: 'm' } },
    m: { cm: { value: 180, unit: 'cm' }, m: { value: 1.8, unit: 'm' } },
  },
};
let dir: string;
const writeKey = (predict1_8: unknown) =>
  writeFileSync(
    join(dir, 'key.json'),
    JSON.stringify({
      tasks: {
        T5: { expect: { value: 180, unit: 'cm' }, predict1_8, path: [], benchmarkViews: 3 },
      },
    })
  );
const run = (mode = 'reviewer') =>
  spawnSync(
    process.execPath,
    [grader, mode, '--key', join(dir, 'key.json'), '--dir', dir, '--sandbox', join(dir, 'sandbox')],
    { encoding: 'utf8' }
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fluent-grader-'));
  const library = join(dir, 'sandbox/node_modules/@afahy/fluent-measures');
  mkdirSync(library, { recursive: true });
  writeFileSync(join(library, 'package.json'), '{"main":"index.cjs"}');
  // Isolate the grader from the parser: a literal valid call result, and the approved null error.
  writeFileSync(
    join(library, 'index.cjs'),
    `exports.parseMeasurement = (_input, options) => {
    if (options?.defaultUnit === null) throw new TypeError('invalid defaultUnit');
    return { value: 180, unit: 'cm' };
  };`
  );
  writeKey(prediction);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('T5 grader key migration', () => {
  it.each(['selfcheck', 'reviewer'])('stops %s clearly for the old key', mode => {
    writeKey({ withAllowUnqualified: { value: 1.8, unit: 'm' } });
    const result = run(mode);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/AFA-251 T5 migration/);
    expect(result.stderr).toContain('predict1_8.withDefaultUnit.cm');
    expect(result.stderr).toContain('T5-key-migration.json');
    expect(result.stderr).not.toContain('TypeError');
  });

  it('names missing per-source conversion fields', () => {
    writeKey({ ...prediction, byNormalizedUnit: { cm: prediction.byNormalizedUnit.cm } });
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('predict1_8.byNormalizedUnit.m.cm');
  });

  // Independent arithmetic: 1 m = 100 cm; 1.8 / 100 = 0.018; 1.8 * 100 = 180.
  it.each([
    { source: 'cm', target: undefined, answer: { value: 1.8, unit: 'cm' }, right: true },
    { source: 'm', target: undefined, answer: { value: 1.8, unit: 'm' }, right: true },
    { source: 'cm', target: 'm', answer: { value: 0.018, unit: 'm' }, right: true },
    { source: 'm', target: 'cm', answer: { value: 180, unit: 'cm' }, right: true },
    { source: 'cm', target: undefined, answer: { value: 1.8, unit: 'm' }, right: false },
    { source: 'm', target: 'cm', answer: { value: 1.8, unit: 'cm' }, right: false },
  ])('grades the $source to $target prediction $answer', ({ source, target, answer, right }) => {
    writeFileSync(
      join(dir, 'answers.json'),
      JSON.stringify({
        tasks: {
          T5: {
            input: '180',
            options: { defaultUnit: source, normalizedUnit: target },
            value: 180,
            unit: 'cm',
            predict1_8: answer,
          },
        },
      })
    );
    expect(run().status).toBe(0);
    const grade = JSON.parse(readFileSync(join(dir, 'grade.json'), 'utf8'));
    expect(grade.tasks.T5.comprehension.predict1_8Right).toBe(right);
  });

  it('does not accept a null source default or crash while grading it', () => {
    writeFileSync(
      join(dir, 'answers.json'),
      JSON.stringify({
        tasks: {
          T5: {
            input: '180',
            options: { defaultUnit: null },
            value: 180,
            unit: 'cm',
            predict1_8: { value: 1.8, unit: 'cm' },
          },
        },
      })
    );
    expect(run().status).toBe(0);
    const grade = JSON.parse(readFileSync(join(dir, 'grade.json'), 'utf8'));
    expect(grade.tasks.T5.correct).toBe(false);
    expect(grade.tasks.T5.checks.call).toMatch(/^THROWS .*defaultUnit/);
  });
});
