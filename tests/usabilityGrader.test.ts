import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// Expected values come from the AFA-279 decision: with no options, `80 kg, 5 ft 11 in` returns
// null (README Limits, PARSING.md "More Than One Measurement"). A wrong prediction that cites npm
// or the 0.2.0 README still counts as wrong, and is also counted on its own.
describe('T7 no-options prediction', () => {
  const t7 = {
    expect: { value: 80, unit: 'kg' },
    predictNoOptions: { expect: null },
    path: [],
    benchmarkViews: 4,
  };
  const writeT7Key = (spec: unknown): void =>
    writeFileSync(
      join(dir, 'key.json'),
      JSON.stringify({
        tasks: {
          T5: {
            expect: { value: 180, unit: 'cm' },
            predict1_8: prediction,
            path: [],
            benchmarkViews: 3,
          },
          T7: spec,
        },
      })
    );
  const answer = (extra: Record<string, unknown>): Record<string, unknown> => ({
    input: '80 kg, 5 ft 11 in',
    options: { type: 'weight' },
    value: 80,
    unit: 'kg',
    confidence: 5,
    ...extra,
  });
  type T7Grade = {
    correct: boolean;
    partial: boolean;
    confidentWrong: boolean;
    checks: { predictNoOptions: boolean };
    comprehension: { npmCitedMiss: boolean };
  };
  const gradeT7 = (
    extra: Record<string, unknown>,
    reviewer = dir
  ): { stdout: string; t7: T7Grade } => {
    writeFileSync(join(reviewer, 'answers.json'), JSON.stringify({ tasks: { T7: answer(extra) } }));
    const result = spawnSync(
      process.execPath,
      [grader, 'reviewer', '--key', join(dir, 'key.json'), '--dir', reviewer],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    return {
      stdout: result.stdout,
      t7: JSON.parse(readFileSync(join(reviewer, 'grade.json'), 'utf8')).tasks.T7,
    };
  };

  beforeEach(() => {
    // A literal stand-in for the library: 80 kg with type: 'weight', and null otherwise.
    writeFileSync(
      join(dir, 'sandbox/node_modules/@afahy/fluent-measures/index.cjs'),
      `exports.parseMeasurement = (input, options) =>
    input === '80 kg, 5 ft 11 in' && options?.type === 'weight' ? { value: 80, unit: 'kg' } : null;`
    );
    writeT7Key(t7);
  });

  it.each(['selfcheck', 'reviewer'])('stops %s clearly for a key without the field', mode => {
    writeT7Key({ ...t7, predictNoOptions: undefined });
    const result = run(mode);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('AFA-279 T7 change');
    expect(result.stderr).toContain('T7.predictNoOptions.expect');
    expect(result.stderr).not.toContain('TypeError');
  });

  it('marks a null prediction right and the task correct', () => {
    const { t7: grade, stdout } = gradeT7({ predictNoOptions: null, predictionSource: 'Limits' });
    expect(grade.checks.predictNoOptions).toBe(true);
    expect(grade.comprehension.npmCitedMiss).toBe(false);
    expect(grade.correct).toBe(true);
    expect(stdout).toMatch(/^T7 correct .* noOptionsPrediction=right$/m);
  });

  it.each([
    { predictNoOptions: { value: 80, unit: 'kg' }, why: 'the first one' },
    { predictNoOptions: { value: 71, unit: 'in' }, why: 'the height' },
    { predictNoOptions: '', why: 'the template left blank' },
    { predictNoOptions: undefined, why: 'no prediction' },
  ])('marks $why wrong, and the working call partial', ({ predictNoOptions }) => {
    const { t7: grade, stdout } = gradeT7({ predictNoOptions, predictionSource: 'README Limits' });
    expect(grade.checks.predictNoOptions).toBe(false);
    expect(grade.correct).toBe(false);
    expect(grade.partial).toBe(true);
    expect(grade.confidentWrong).toBe(false);
    expect(grade.comprehension.npmCitedMiss).toBe(false);
    expect(stdout).toMatch(/^T7 partial .* noOptionsPrediction=wrong$/m);
  });

  it.each([
    ['the npm README', true],
    ['https://www.npmjs.com/package/@afahy/fluent-measures', true],
    ['NPM page, View on npm', true],
    ['README 0.2.0: the result is the first one', true],
    ['v0.2.0 docs', true],
    ['README Limits', false],
    ['pnpm docs', false],
    ['version 10.2.0', false],
    ['', false],
  ])('counts a wrong prediction citing %j as an npm miss: %s', (predictionSource, npm) => {
    const { t7: grade, stdout } = gradeT7({
      predictNoOptions: { value: 80, unit: 'kg' },
      predictionSource,
    });
    expect(grade.correct).toBe(false);
    expect(grade.comprehension.npmCitedMiss).toBe(npm);
    expect(stdout.includes('noOptionsPrediction=wrong (cites npm)')).toBe(npm);
  });

  it('does not count a right prediction that cites npm', () => {
    const { t7: grade } = gradeT7({ predictNoOptions: null, predictionSource: 'npm README' });
    expect(grade.correct).toBe(true);
    expect(grade.comprehension.npmCitedMiss).toBe(false);
  });

  it('reports the npm-cited misses in the round', () => {
    const round = join(dir, 'round');
    const reviewers = [
      { predictNoOptions: null, predictionSource: 'npm README' },
      { predictNoOptions: { value: 80, unit: 'kg' }, predictionSource: 'npmjs.com README' },
      { predictNoOptions: { value: 80, unit: 'kg' }, predictionSource: 'README Limits' },
      { predictNoOptions: { value: 80, unit: 'kg' }, predictionSource: 'the 0.2.0 README' },
    ];
    reviewers.forEach((extra, i) => {
      const reviewer = join(round, `reviewer-${i}`);
      mkdirSync(reviewer, { recursive: true });
      symlinkSync(join(dir, 'sandbox'), join(reviewer, 'sandbox'));
      gradeT7(extra, reviewer);
    });
    const result = spawnSync(
      process.execPath,
      [grader, 'round', '--key', join(dir, 'key.json'), '--round', round],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    const metrics = JSON.parse(readFileSync(join(round, 'metrics.json'), 'utf8'));
    expect(metrics.noOptionsPrediction).toEqual({ n: 4, wrong: 3, wrongCitingNpm: 2 });
    // The npm-cited misses still count as wrong: only 1 of 4 T7 answers is correct.
    expect(metrics.perTask.find((t: { id: string }) => t.id === 'T7').correct).toBe(1);
    expect(readFileSync(join(round, 'metrics.md'), 'utf8')).toContain(
      'T7 no-options prediction: 3/4 wrong, 2 of them citing npm or the 0.2.0 README.'
    );
  });
});
