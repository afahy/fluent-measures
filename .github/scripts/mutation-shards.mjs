// CI-only shard orchestration. Local pnpm test:mutation still runs the unchanged full config.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fullInventory, mutantKey } from './mutation-inventory.mjs';

export const shards = ['parse-start', 'parse-end', 'tokenize', 'rest'];
const parser = 'src/parseMeasurement.ts';
const tokenizer = 'src/tokenize.ts';
const inputsPath = 'reports/mutation-inputs/inventory.json';
const reportPath = 'reports/mutation/mutation.json';
const cachePath = 'reports/stryker-incremental.json';
const config = () => JSON.parse(readFileSync('stryker.config.json', 'utf8'));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => writeFileSync(file, JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const run = () => {
  const values = ['GITHUB_RUN_ID', 'GITHUB_SHA'].map(key => process.env[key]);
  if (values.some(value => !value)) throw new Error('Missing CI run identity');
  return values.join('-');
};

export function selection(shard, file, source) {
  if (!shards.includes(shard)) throw new Error(`Unknown mutation shard ${shard}`);
  if (file === parser) {
    const lines = source.split('\n');
    // Follow the top-level function when preceding helpers change, rather than fixing a line
    // number that could drift inside its spanning block mutant on the next parser edit.
    const split = lines.findIndex(line => /^export function parseMeasurement\(/.test(line));
    if (split < 1) throw new Error('Cannot find the top-level parser shard boundary');
    const last = lines.length - 1;
    if (shard === 'parse-start')
      return [
        {
          start: { line: 0, column: 0 },
          end: { line: split - 1, column: Number.MAX_SAFE_INTEGER },
        },
      ];
    if (shard === 'parse-end')
      return [
        { start: { line: split, column: 0 }, end: { line: last, column: Number.MAX_SAFE_INTEGER } },
      ];
    return false;
  }
  if (file === tokenizer) return shard === 'tokenize';
  return shard === 'rest';
}

const position = (a, b) => a.line - b.line || a.column - b.column;
export const inSelection = (selected, mutant) =>
  selected === true ||
  (Array.isArray(selected) &&
    selected.some(
      range =>
        position(
          { line: mutant.location.start.line - 1, column: mutant.location.start.column - 1 },
          range.start
        ) >= 0 &&
        position(range.end, {
          line: mutant.location.end.line - 1,
          column: mutant.location.end.column - 1,
        }) >= 0
    ));

// Prove coverage of source text, including files without mutants. Counting mutants alone would
// allow an empty/range-selected type-only file to masquerade as a full selection.
export function coversFile(selections, source) {
  if (selections.includes(true)) return true;
  const lines = source.split('\n');
  const offset = point =>
    lines.slice(0, point.line).reduce((sum, line) => sum + line.length + 1, 0) +
    Math.min(point.column, lines[point.line]?.length ?? 0);
  const ranges = selections
    .filter(Array.isArray)
    .flat()
    .map(range => [offset(range.start), offset(range.end)]);
  ranges.sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const [from, to] of ranges) {
    // Line ranges include the newline between adjacent lines.
    if (from > end && source.slice(end, from) !== '\n') return false;
    end = Math.max(end, to);
  }
  return end >= source.length || source.slice(end) === '\n';
}

export function trimCache(report, shard, inventory) {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files).flatMap(([file, result]) => {
        const source = inventory.files[file]?.source;
        if (source === undefined) return [];
        const selected = selection(shard, file, source);
        if (selected === false) return [];
        return [
          [
            file,
            { ...result, mutants: result.mutants.filter(mutant => inSelection(selected, mutant)) },
          ],
        ];
      })
    ),
  };
}

const completed = new Set([
  'Killed',
  'Timeout',
  'Survived',
  'NoCoverage',
  'Ignored',
  'CompileError',
  'RuntimeError',
]);

export function mergeReports(
  inventory,
  bundles,
  expectedRun,
  expectedAttempt = 1,
  readSource = file => readFileSync(file, 'utf8')
) {
  if (!inventory.filesRead || !inventory.files || !Array.isArray(inventory.mutants))
    throw new Error('Incomplete full mutant inventory');
  if (
    Object.entries(inventory.files).some(
      ([file, result]) =>
        inventory.filesRead[file] !== true ||
        typeof result.source !== 'string' ||
        !Array.isArray(result.mutants) ||
        result.mutants.length !== 0
    )
  )
    throw new Error('Incomplete full source selection');
  if (
    inventory.run !== expectedRun ||
    !Number.isInteger(inventory.attempt) ||
    inventory.attempt < 1 ||
    inventory.attempt > expectedAttempt
  )
    throw new Error('Stale mutation inventory');
  if (!inventory.mutants.length) throw new Error('Empty full mutant inventory');
  const expected = new Set(inventory.mutants);
  if (expected.size !== inventory.mutants.length)
    throw new Error('Duplicate full-inventory mutant');
  const seen = new Set();
  const files = structuredClone(inventory.files);
  const testFiles = {};
  const tests = new Map();
  const selections = new Map(Object.keys(files).map(file => [file, []]));
  let stopped = false;
  if (bundles.length !== shards.length) throw new Error('Missing mutation shard artifact');
  for (const shard of shards) {
    const matches = bundles.filter(bundle => bundle.shard === shard);
    if (matches.length !== 1) throw new Error(`Missing or duplicate shard ${shard}`);
    const bundle = matches[0];
    if (
      bundle.run !== expectedRun ||
      bundle.inventory !== digest(inventory) ||
      !Number.isInteger(bundle.attempt) ||
      bundle.attempt < inventory.attempt ||
      bundle.attempt > expectedAttempt
    )
      throw new Error(`Stale artifact for ${shard}`);
    if (!['complete', 'stopped'].includes(bundle.state))
      throw new Error(`Failed mutation shard ${shard}`);
    stopped ||= bundle.state === 'stopped';
    const report = bundle.report;
    if (!report?.files || !report.testFiles) throw new Error(`Incomplete report for ${shard}`);
    if (bundle.state === 'complete') {
      if (!report.filesRead) throw new Error(`Missing selection for ${shard}`);
      for (const [file, result] of Object.entries(files)) {
        const selected = selection(shard, file, result.source);
        if (!isDeepStrictEqual(report.filesRead[file], selected))
          throw new Error(`Incomplete selection of ${file} in ${shard}`);
        selections.get(file).push(report.filesRead[file]);
      }
      for (const [file, selected] of Object.entries(report.filesRead)) {
        if (selected !== false && !Object.hasOwn(files, file))
          throw new Error(`Unexpected selected file ${file}`);
      }
    }
    // Stryker assigns test ids separately per shard. Remap by definition, retaining sources so
    // the aggregate is itself a usable incremental report, even when test subsets differ.
    const ids = new Map();
    for (const [file, result] of Object.entries(report.testFiles)) {
      if (result.source !== readSource(file)) throw new Error(`Stale test source ${file}`);
      const target = (testFiles[file] ??= { ...result, tests: [] });
      const occurrences = new Map();
      for (const test of result.tests) {
        const { id, ...definition } = test;
        const definitionKey = JSON.stringify(definition);
        const occurrence = occurrences.get(definitionKey) ?? 0;
        occurrences.set(definitionKey, occurrence + 1);
        const key = JSON.stringify([file, definition, occurrence]);
        if (!tests.has(key)) {
          const mergedId = String(tests.size);
          tests.set(key, mergedId);
          target.tests.push({ ...definition, id: mergedId });
        }
        if (ids.has(id)) throw new Error(`Duplicate test id in ${shard}`);
        ids.set(id, tests.get(key));
      }
    }
    for (const [file, result] of Object.entries(report.files)) {
      if (result.source !== files[file]?.source)
        throw new Error(`Stale or unexpected source ${file}`);
      files[file].language ??= result.language;
      for (const mutant of result.mutants) {
        const key = mutantKey(file, mutant);
        if (!expected.has(key)) throw new Error(`Unexpected mutant ${key}`);
        if (seen.has(key)) throw new Error(`Duplicate mutant ${key}`);
        if (!inSelection(selection(shard, file, result.source), mutant))
          throw new Error(`Mutant in wrong shard ${key}`);
        if (!completed.has(mutant.status)) throw new Error(`Incomplete mutant ${key}`);
        seen.add(key);
        const remap = references =>
          references?.map(id => {
            if (!ids.has(id)) throw new Error(`Unknown test id ${id} in ${shard}`);
            return ids.get(id);
          });
        files[file].mutants.push({
          ...mutant,
          id: String(seen.size - 1),
          coveredBy: remap(mutant.coveredBy),
          killedBy: remap(mutant.killedBy),
        });
      }
    }
  }
  if (!stopped && seen.size !== expected.size)
    throw new Error(`Missing mutants: received ${seen.size} of ${expected.size}`);
  if (
    !stopped &&
    [...selections].some(([file, selected]) => !coversFile(selected, files[file].source))
  ) {
    throw new Error('Shard selections do not cover whole source files');
  }
  const report = { schemaVersion: '1.0', thresholds: config().thresholds, files, testFiles };
  if (!stopped) report.filesRead = inventory.filesRead;
  return { report, stopped, count: seen.size, total: expected.size };
}

async function main() {
  const [command, shard, status] = process.argv.slice(2);
  if (command === 'inventory') {
    const { Stryker } = await import('@stryker-mutator/core');
    await new Stryker({
      dryRunOnly: true,
      incremental: false,
      ignorePatterns: [...(config().ignorePatterns ?? []), 'reports/**'],
      appendPlugins: [fileURLToPath(new URL('./mutation-inventory.mjs', import.meta.url))],
      reporters: ['mutation-inventory'],
    }).runMutationTest();
    const inventory = {
      run: run(),
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      ...(await fullInventory()),
    };
    if (!inventory.files[parser] || !inventory.files[tokenizer])
      throw new Error('Missing parser or tokenizer in inventory');
    mkdirSync('reports/mutation-inputs', { recursive: true });
    write(inputsPath, inventory);
    if (existsSync(cachePath)) write('reports/mutation-inputs/incremental.json', read(cachePath));
  } else if (command === 'prepare') {
    const inventory = read(inputsPath);
    if (inventory.run !== run()) throw new Error('Stale mutation inputs');
    const selected = Object.entries(inventory.files).filter(
      ([file, result]) => selection(shard, file, result.source) !== false
    );
    // Use the configured glob for the last shard, so new files are always selected too.
    const mutate =
      shard === 'rest'
        ? [...config().mutate, `!${parser}`, `!${tokenizer}`].join(',')
        : selected
            .map(([file, result]) => {
              const range = selection(shard, file, result.source);
              return range === true
                ? file
                : `${file}:${range[0].start.line + 1}-${range[0].end.line + 1}`;
            })
            .join(',');
    rmSync(cachePath, { force: true });
    if (
      process.env.GITHUB_RUN_ATTEMPT === '1' &&
      existsSync('reports/mutation-inputs/incremental.json')
    ) {
      write(
        cachePath,
        trimCache(read('reports/mutation-inputs/incremental.json'), shard, inventory)
      );
    }
    writeFileSync(process.env.GITHUB_OUTPUT, `mutate=${mutate}\n`, { flag: 'a' });
  } else if (command === 'pack') {
    const inventory = read(inputsPath);
    const state = status === '0' ? 'complete' : status === '124' ? 'stopped' : 'failed';
    const path = state === 'complete' ? reportPath : cachePath;
    const report = existsSync(path) ? trimCache(read(path), shard, inventory) : undefined;
    write('reports/mutation-shard.json', {
      run: run(),
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      inventory: digest(inventory),
      shard,
      state,
      report,
    });
  } else if (command === 'merge') {
    rmSync(reportPath, { force: true });
    rmSync(cachePath, { force: true });
    const inventory = read(inputsPath);
    const bundles = shards.map(name => read(`reports/shards/${name}/mutation-shard.json`));
    const { report, stopped, count, total } = mergeReports(
      inventory,
      bundles,
      run(),
      Number(process.env.GITHUB_RUN_ATTEMPT)
    );
    mkdirSync('reports/mutation', { recursive: true });
    write(cachePath, report);
    if (!stopped) write(reportPath, report);
    if (process.env.GITHUB_OUTPUT)
      writeFileSync(process.env.GITHUB_OUTPUT, `valid=true\nstopped=${stopped}\n`, { flag: 'a' });
    console.log(
      `Mutation inventory: ${count}/${total} mutants, ${stopped ? 'stopped' : 'complete'}.`
    );
    const require = createRequire(createRequire(import.meta.url).resolve('@stryker-mutator/core'));
    const { calculateMutationTestMetrics } = await import(
      pathToFileURL(require.resolve('mutation-testing-metrics'))
    );
    const { mutationScore } = calculateMutationTestMetrics(report).systemUnderTestMetrics.metrics;
    console.log(
      `Aggregate mutation score ${mutationScore.toFixed(2)}; break ${report.thresholds.break}.`
    );
    if (stopped || mutationScore < report.thresholds.break) process.exitCode = 1;
  } else {
    throw new Error(
      'Usage: mutation-shards.mjs inventory | prepare <shard> | pack <shard> <exit-status> | merge'
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
