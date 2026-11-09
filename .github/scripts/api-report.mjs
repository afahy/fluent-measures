// Checks the types that the package exports against the committed api-report.d.ts. A change to an
// exported type needs the maintainer's approval (AGENTS.md, "Stop and ask"), so the report makes
// each such change show in the PR's diff. Run it from the repository root after `pnpm build`.
// With --update, it writes the report from the build.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

export const REPORT = 'api-report.d.ts';
// tsup writes the same declarations for each format, and each must match the report.
const BUILDS = ['dist/index.d.ts', 'dist/index.d.cts'];

/**
 * The declarations as the report holds them: with no comments, because a comment doesn't change
 * a type, and formatted as Prettier formats the report.
 *
 * @param {string} declarations
 * @returns {Promise<string>}
 */
export async function apiReport(declarations) {
  const file = ts.createSourceFile('index.d.ts', declarations, ts.ScriptTarget.Latest);
  const printed = ts.createPrinter({ removeComments: true }).printFile(file);
  return format(printed, { ...(await resolveConfig(REPORT)), filepath: REPORT });
}

/**
 * @param {string} path
 * @param {string} fix What to do when the file is missing.
 * @returns {string}
 */
function read(path, fix) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`${path} is missing. ${fix}`);
  }
}

async function main() {
  const reports = await Promise.all(
    BUILDS.map(async build => apiReport(read(build, 'Run `pnpm build` first.')))
  );
  if (process.argv.includes('--update')) {
    writeFileSync(REPORT, reports[0]);
    console.log(`Wrote ${REPORT} from ${BUILDS[0]}.`);
    return;
  }
  const committed = read(REPORT, 'Run `pnpm check:api --update` to write it from the build.');
  let changed = false;
  for (const [index, report] of reports.entries()) {
    if (report === committed) continue;
    changed = true;
    const built = join(mkdtempSync(join(tmpdir(), 'api-report-')), REPORT);
    writeFileSync(built, report);
    console.log(`The types in ${BUILDS[index]} don't match ${REPORT}:`);
    spawnSync('git', ['diff', '--no-index', '--no-color', REPORT, built], { stdio: 'inherit' });
  }
  if (!changed) {
    console.log(`The exported types match ${REPORT}.`);
    return;
  }
  console.error(
    `::error::The exported types changed. A change to a type that src/index.ts exports needs ` +
      `the maintainer's approval. When the ticket has it, run \`pnpm check:api --update\` and ` +
      `commit ${REPORT}.`
  );
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
