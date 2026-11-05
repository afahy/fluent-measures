// try.mjs: runs one of the reviewer's files with Node in their sandbox project, prints what it
// printed, and appends a "run" event to the trace. A run that throws or exits non-zero is logged
// as failed. The grader counts failed runs as wrong turns.
//
//   node try.mjs --task T2 <file>     (the file is relative to $SANDBOX, .mjs, .cjs, .js or .ts)
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { task: { type: 'string' }, note: { type: 'string', default: '' } },
});
const { SANDBOX, TRACE } = process.env;
if (!SANDBOX || !TRACE) {
  console.error('try.mjs: run "source env.sh" in your reviewer folder first.');
  process.exit(2);
}
if (!/^[TH][0-9]+$/.test(values.task ?? '') || positionals.length !== 1) {
  console.error('try.mjs: usage: node try.mjs --task T2 <file> (T1 ... T7, H1 or H2)');
  process.exit(2);
}
const file = resolve(SANDBOX, positionals[0]);
const started = Date.now();
const run = spawnSync(process.execPath, [file], { cwd: SANDBOX, encoding: 'utf8', timeout: 20000 });
const ok = run.status === 0 && !run.error;
appendFileSync(
  TRACE,
  JSON.stringify({
    t: new Date().toISOString(),
    kind: 'run',
    task: values.task,
    file: positionals[0],
    ok,
    exit: run.status,
    ms: Date.now() - started,
    stdout: run.stdout.slice(0, 2000),
    stderr: run.stderr.slice(0, 2000),
    note: values.note,
  }) + '\n'
);
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
console.log(`--- exit ${run.status}${ok ? '' : ' (logged as a failed run)'}`);
