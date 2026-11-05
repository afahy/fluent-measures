// grade.mjs: grades usability reviewers against the answer key, from their answers.json and the
// trace that browse.mjs and try.mjs wrote. Reviewers never run it.
//
//   node grade.mjs selfcheck --key <answer-key.json> --sandbox <dir>
//       Runs the key's reference calls in a sandbox. Run it once per sandbox package. A mismatch
//       means the sandbox has the wrong package (for example npm 0.1.1) or the library changed.
//   node grade.mjs reviewer --key <answer-key.json> --dir <reviewer dir>
//       Writes <dir>/grade.json.
//   node grade.mjs round --key <answer-key.json> --round <round dir>
//       Reads each <round>/reviewer-*/grade.json and writes <round>/metrics.json and metrics.md,
//       with the acceptance checks of SKILL.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Acceptance thresholds. SKILL.md "Acceptance criteria" explains them; change both together.
const ACCEPT = {
  minCorrectShare: 0.9, // of all task attempts in the round
  minCorrectPerTask: 0.75, // of the reviewers, for each task
  maxConfidentWrong: 0, // wrong answers with confidence 4 or 5
  maxMedianWrongTurns: 0, // per attempt, over the round
  maxMeanWrongTurnsPerTask: 1,
  maxViewsOverBenchmark: 2, // median views per task may be at most benchmark x this
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: 'string' },
    sandbox: { type: 'string' },
    dir: { type: 'string' },
    round: { type: 'string' },
  },
});
const mode = positionals[0];
const fail = message => {
  console.error(`grade.mjs: ${message}`);
  process.exit(2);
};
if (!values.key) fail('give --key <answer-key.json>.');
const key = JSON.parse(readFileSync(values.key, 'utf8'));

const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const sameParts = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  a.every((part, i) => part?.value === b[i].value && part?.unit === b[i].unit);
const sameValue = (got, want) =>
  want === null
    ? got === null || got === undefined
    : got?.value === want.value && got?.unit === want.unit;
const median = list => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

const library = sandbox =>
  createRequire(join(resolve(sandbox), 'package.json'))('@afahy/fluent-measures');
const call = (lib, input, options) => {
  try {
    return { result: lib.parseMeasurement(input, options ?? {}) };
  } catch (error) {
    return { threw: error.message };
  }
};

if (mode === 'selfcheck') {
  if (!values.sandbox) fail('give --sandbox <dir>.');
  const lib = library(values.sandbox);
  const problems = [];
  const check = (label, got, ok) => {
    const line = `${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`;
    console.log(line);
    if (!ok) problems.push(line);
  };
  const t = key.tasks;
  const r1 = call(lib, t.T1.expect.input).result;
  check(
    'T1',
    r1,
    JSON.stringify(r1 && { ...r1, matches: r1.matches }) !== undefined &&
      r1?.value === 6 &&
      r1?.unit === 'ft' &&
      r1?.type === 'height' &&
      sameParts(r1?.matches, t.T1.expect.result.matches)
  );
  for (const id of ['T2', 'T3', 'T5', 'T6', 'T7', 'H1', 'H2']) {
    const { input, options } = t[id].reference;
    const got = call(lib, input, options);
    const want = t[id].expect;
    const tol = t[id].tolerance?.call ?? 1e-9;
    let ok = near(got.result?.value, want.value, tol) && got.result?.unit === want.unit;
    if (id === 'T3') ok &&= sameParts(got.result?.matches, want.parts);
    check(id, got, ok);
  }
  check(
    'T6 without fuzziness',
    call(lib, t.T6.reference.input).result,
    call(lib, t.T6.reference.input).result === null
  );
  for (const c of t.T4.functionCases) {
    const got = call(lib, c.input, t.T4.reference.options);
    const value = got.result?.value ?? null;
    check(
      `T4 ${c.input}`,
      got,
      !got.threw && (c.expect === null ? value === null : near(value, c.expect, 1e-6))
    );
  }
  for (const [input, want] of Object.entries(t.T4.predictions)) {
    const got = call(lib, input).result;
    check(`T4 prediction ${input}`, got, sameValue(got, want));
  }
  const p18 = call(lib, '1.8', t.T5.reference.options).result;
  check('T5 1.8', p18, sameValue(p18, t.T5.predict1_8.withAllowUnqualified));
  for (const [unit, want] of Object.entries(t.T5.predict1_8.byNormalizedUnit ?? {})) {
    const got = call(lib, '1.8', { ...t.T5.reference.options, normalizedUnit: unit }).result;
    check(`T5 1.8 in ${unit}`, got, near(got?.value, want.value, 1e-9) && got?.unit === want.unit);
  }
  console.log(
    problems.length
      ? `\n${problems.length} mismatches. Don't run reviewers on this sandbox.`
      : '\nThe sandbox agrees with the key.'
  );
  process.exit(problems.length ? 1 : 0);
}

if (mode === 'reviewer') {
  if (!values.dir) fail('give --dir <reviewer dir>.');
  const dir = resolve(values.dir);
  const sandbox = join(dir, 'sandbox');
  const answers = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8')).tasks ?? {};
  const trace = existsSync(join(dir, 'trace.jsonl'))
    ? readFileSync(join(dir, 'trace.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    : [];
  const lib = library(sandbox);
  const out = { dir, tasks: {} };

  for (const [id, spec] of Object.entries(key.tasks)) {
    if (spec.holdout && !answers[id]) continue; // holdout tasks run only in the baseline and final rounds
    const a = answers[id] ?? {};
    const events = trace.filter(e => e.task === id);
    const views = events.filter(e => e.kind === 'view');
    const runs = events.filter(e => e.kind === 'run');
    const allowedOff = key.offPageAllowed?.[id] ?? [];
    // An excursion is a run of views that are off the task's path, or off the page and not allowed.
    let excursions = 0;
    let inExcursion = false;
    const offPath = [];
    views.forEach((v, i) => {
      if (id === 'T1' && i < 2) return; // orientation on first arrival isn't a wrong turn
      const allowed = v.onPage
        ? spec.path.includes(v.section)
        : allowedOff.some(u => v.url.startsWith(u));
      if (!allowed) {
        offPath.push(v.onPage ? `#${v.section}` : v.url);
        if (!inExcursion) excursions++;
        inExcursion = true;
      } else inExcursion = false;
    });
    const failedRuns = runs.filter(r => !r.ok).length;
    const times = events.map(e => Date.parse(e.t));
    const checks = {};
    let correct = false;
    let partial = false;
    const comprehension = {};

    if (id === 'T1') {
      const cmd = (a.installCommand ?? '')
        .replace(/^\$\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      checks.install = spec.acceptInstall.includes(cmd);
      checks.import = spec.importMustMention.every(word => (a.importLine ?? '').includes(word));
      const rerun = a.file
        ? spawnSync(process.execPath, [join(sandbox, a.file)], {
            cwd: sandbox,
            encoding: 'utf8',
            timeout: 20000,
          })
        : null;
      checks.runs = rerun?.status === 0 && /\b6\b/.test(rerun.stdout) && /ft/.test(rerun.stdout);
      correct = checks.install && checks.import && checks.runs;
      partial = !correct && (checks.install || checks.runs);
    } else if (id === 'T4') {
      const fileUrl = a.file ? pathToFileURL(join(sandbox, a.file)).href : null;
      const cases = spec.functionCases.map(c => c.input);
      const script = `import { toKg } from ${JSON.stringify(fileUrl)};
        const out = {};
        for (const input of ${JSON.stringify(cases)}) {
          try { const v = toKg(input); out[input] = v === undefined ? null : v; }
          catch (e) { out[input] = 'THROWS ' + e.message; }
        }
        console.log(JSON.stringify(out));`;
      const run = fileUrl
        ? spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: sandbox,
            encoding: 'utf8',
            timeout: 20000,
          })
        : null;
      let got = {};
      try {
        got = JSON.parse(run?.stdout || '{}');
      } catch {
        got = {};
      }
      checks.cases = spec.functionCases.map(c => ({
        input: c.input,
        got: got[c.input],
        ok: c.expect === null ? got[c.input] === null : near(got[c.input], c.expect, 1e-4),
      }));
      checks.neverThrows = checks.cases.every(c => !String(c.got).startsWith('THROWS'));
      correct = checks.cases.every(c => c.ok);
      partial = !correct && checks.neverThrows;
      const preds = Object.entries(spec.predictions).map(([input, want]) =>
        sameValue(a.predictions?.[input], want)
      );
      comprehension.predictionsRight = `${preds.filter(Boolean).length}/${preds.length}`;
    } else {
      const got = call(lib, a.input, a.options);
      checks.call = got.threw
        ? `THROWS ${got.threw}`
        : got.result && { value: got.result.value, unit: got.result.unit };
      const want = spec.expect;
      const tol = spec.tolerance ?? { call: 1e-9, reported: 0.01 };
      const callOk =
        near(got.result?.value, want.value, tol.call) && got.result?.unit === want.unit;
      checks.callOk = callOk;
      checks.reportedOk = near(Number(a.value), want.value, tol.reported) && a.unit === want.unit;
      correct = callOk && checks.reportedOk;
      if (id === 'T3') {
        checks.partsField = a.partsField === want.partsField;
        checks.parts = sameParts(a.parts, want.parts);
        correct &&= checks.partsField && checks.parts;
      }
      if (id === 'T5') {
        const unqualified = Boolean(a.options?.allowUnqualified);
        // With normalizedUnit, the prediction is the converted value (1.8 m is 180 cm).
        const converted = spec.predict1_8.byNormalizedUnit?.[a.options?.normalizedUnit];
        const want18 = unqualified
          ? (converted ?? spec.predict1_8.withAllowUnqualified)
          : spec.predict1_8.withCmAppended;
        comprehension.predict1_8Right = sameValue(a.predict1_8, want18);
        comprehension.predict1_8Confidence = a.predict1_8Confidence ?? null;
        comprehension.confidentWrongPrediction =
          !comprehension.predict1_8Right && (a.predict1_8Confidence ?? 0) >= 4;
      }
      if (id === 'T6') {
        checks.smallest = a.options?.fuzziness === want.fuzziness;
        checks.withoutSetting = sameValue(a.withoutSetting, want.withoutSetting);
        partial = correct && !checks.smallest;
        correct &&= checks.smallest && checks.withoutSetting;
      }
      if (id === 'T7') {
        comprehension.predictNoOptions = a.predictNoOptions ?? null;
        comprehension.predictionSource = a.predictionSource ?? '';
      }
      partial ||= !correct && callOk;
    }

    const confidence = Number(a.confidence) || null;
    out.tasks[id] = {
      status: a.status ?? 'missing',
      correct,
      partial,
      confidence,
      confidentWrong: !correct && !partial && (confidence ?? 0) >= 4, // a partial answer works but misses part of the task
      views: views.length,
      benchmarkViews: spec.benchmarkViews,
      runs: runs.length,
      failedRuns,
      offPathExcursions: excursions,
      offPath,
      wrongTurns: excursions + failedRuns,
      // A run that exits 0 with a wrong value isn't counted above. The organizer reads this log and
      // counts such a run as a wrong turn in synthesis.md (SKILL.md, "6. Review round").
      runLog: runs.map(r => ({ file: r.file, ok: r.ok, stdout: (r.stdout ?? '').slice(0, 160) })),
      seconds:
        times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : null,
      checks,
      comprehension,
      helped: a.helped ?? '',
      misled: a.misled ?? '',
      notes: a.notes ?? '',
    };
  }
  writeFileSync(join(dir, 'grade.json'), JSON.stringify(out, null, 2) + '\n');
  for (const [id, g] of Object.entries(out.tasks)) {
    console.log(
      `${id} ${g.correct ? 'correct' : g.partial ? 'partial' : 'WRONG  '} conf=${g.confidence} views=${g.views}/${g.benchmarkViews} wrongTurns=${g.wrongTurns} (${g.offPath.join(', ') || 'no off-path views'}; ${g.failedRuns} failed runs)`
    );
  }
  console.log(`Wrote ${join(dir, 'grade.json')}.`);
  process.exit(0);
}

if (mode === 'round') {
  if (!values.round) fail('give --round <round dir>.');
  const round = resolve(values.round);
  const grades = readdirSync(round)
    .filter(name => name.startsWith('reviewer-') && existsSync(join(round, name, 'grade.json')))
    .map(name => ({ name, ...JSON.parse(readFileSync(join(round, name, 'grade.json'), 'utf8')) }));
  if (!grades.length) fail(`no reviewer-*/grade.json in ${round}.`);
  const allIds = Object.keys(key.tasks).filter(id => grades.some(r => r.tasks[id]));
  const perTaskAll = allIds.map(id => {
    const g = grades.map(r => r.tasks[id]).filter(Boolean);
    return {
      id,
      correct: g.filter(x => x.correct).length,
      partial: g.filter(x => x.partial).length,
      n: g.length,
      confidentWrong: g.filter(x => x.confidentWrong).length,
      medianWrongTurns: median(g.map(x => x.wrongTurns)),
      meanWrongTurns: mean(g.map(x => x.wrongTurns)),
      medianViews: median(g.map(x => x.views)),
      benchmarkViews: key.tasks[id].benchmarkViews,
      medianSeconds: median(g.map(x => x.seconds).filter(x => x !== null)),
      holdout: Boolean(key.tasks[id].holdout),
    };
  });
  // Acceptance uses the core tasks. Holdout tasks only show whether fixes taught to the test.
  const perTask = perTaskAll.filter(t => !t.holdout);
  const ids = perTask.map(t => t.id);
  const holdout = perTaskAll.filter(t => t.holdout);
  const share = list =>
    list.reduce((s, t) => s + t.correct, 0) /
    Math.max(
      1,
      list.reduce((s, t) => s + t.n, 0)
    );
  const attempts = perTask.reduce((s, t) => s + t.n, 0);
  const correct = perTask.reduce((s, t) => s + t.correct, 0);
  const confidentWrong = perTask.reduce((s, t) => s + t.confidentWrong, 0);
  const allTurns = grades.flatMap(r => ids.map(id => r.tasks[id].wrongTurns));
  const acceptance = {
    correctShare: { value: correct / attempts, pass: correct / attempts >= ACCEPT.minCorrectShare },
    correctPerTask: {
      pass: perTask.every(t => t.correct / t.n >= ACCEPT.minCorrectPerTask),
      failing: perTask.filter(t => t.correct / t.n < ACCEPT.minCorrectPerTask).map(t => t.id),
    },
    confidentWrong: { value: confidentWrong, pass: confidentWrong <= ACCEPT.maxConfidentWrong },
    medianWrongTurns: {
      value: median(allTurns),
      pass: median(allTurns) <= ACCEPT.maxMedianWrongTurns,
    },
    meanWrongTurnsPerTask: {
      pass: perTask.every(t => t.meanWrongTurns <= ACCEPT.maxMeanWrongTurnsPerTask),
      failing: perTask
        .filter(t => t.meanWrongTurns > ACCEPT.maxMeanWrongTurnsPerTask)
        .map(t => t.id),
    },
    views: {
      pass: perTask.every(t => t.medianViews <= t.benchmarkViews * ACCEPT.maxViewsOverBenchmark),
      failing: perTask
        .filter(t => t.medianViews > t.benchmarkViews * ACCEPT.maxViewsOverBenchmark)
        .map(t => t.id),
    },
  };
  const metricPass = Object.values(acceptance).every(x => x.pass);
  writeFileSync(
    join(round, 'metrics.json'),
    JSON.stringify(
      {
        reviewers: grades.map(g => g.name),
        perTask: perTaskAll,
        acceptance,
        metricPass,
        holdoutShare: holdout.length ? share(holdout) : null,
        coreShare: share(perTask),
      },
      null,
      2
    ) + '\n'
  );
  const rows = perTaskAll.map(
    t =>
      `| ${t.id}${t.holdout ? ' (holdout)' : ''} | ${t.correct}/${t.n} | ${t.partial} | ${t.confidentWrong} | ${t.medianWrongTurns} | ${t.meanWrongTurns?.toFixed(2)} | ${t.medianViews} / ${t.benchmarkViews} | ${t.medianSeconds ?? '-'} |`
  );
  const md = [
    `# Round metrics: ${round}`,
    '',
    `Reviewers: ${grades.map(g => g.name).join(', ')}. Simulated AI reviewers, not human evidence. Times are agent wall-clock, not human time-on-task.`,
    '',
    '| Task | Correct | Partial | Confident-wrong | Median wrong turns | Mean wrong turns | Median views / benchmark | Median seconds |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Correct: ${correct}/${attempts} (${Math.round((100 * correct) / attempts)}%). Confident-wrong: ${confidentWrong}. Median wrong turns per attempt: ${median(allTurns)}.`,
    '',
    holdout.length
      ? `Holdout correct: ${Math.round(100 * share(holdout))}% against core ${Math.round(100 * share(perTask))}%. A gap of more than 15 points after a fix round suggests that a fix taught to the test.`
      : 'No holdout tasks in this round.',
    '',
    '## Metric acceptance',
    '',
    ...Object.entries(acceptance).map(
      ([name, x]) =>
        `- ${x.pass ? 'pass' : 'FAIL'} ${name}${x.failing?.length ? `: ${x.failing.join(', ')}` : x.value !== undefined ? `: ${typeof x.value === 'number' ? +x.value.toFixed(2) : x.value}` : ''}`
    ),
    '',
    `Metric acceptance: ${metricPass ? 'PASS' : 'FAIL'}. The round passes only when this passes and synthesis.md has no open S1 or S2 finding in scope (SKILL.md).`,
  ].join('\n');
  writeFileSync(join(round, 'metrics.md'), md + '\n');
  console.log(md);
  process.exit(0);
}

fail('usage: node grade.mjs selfcheck|reviewer|round --key <file> ...');
