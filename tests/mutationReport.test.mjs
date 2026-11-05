import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { URL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MutationReport, strykerPlugins } from '../.github/scripts/mutation-report.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('the mutation JSON reporter', () => {
  it('registers the reporter through Stryker’s public plugin API', () => {
    expect(strykerPlugins).toEqual([
      { kind: 'Reporter', name: 'mutation-json', injectableClass: MutationReport },
    ]);
    expect(MutationReport.inject).toEqual(['options', 'fileDescriptions']);
  });

  it('writes the results and actual mutation selection, including a file with no mutants', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fluent-measures-report-'));
    directories.push(directory);
    const fileName = join(directory, 'nested', 'mutation.json');
    const reporter = new MutationReport(
      { jsonReporter: { fileName } },
      {
        [resolve('src/types.ts')]: { mutate: true },
        [resolve('src/covered.ts')]: { mutate: [{ start: { line: 0 }, end: { line: 1 } }] },
        [resolve('src/unrelated.test.ts')]: { mutate: false },
      }
    );
    const report = JSON.parse(
      readFileSync(new URL('./fixtures/mutation/full.json', import.meta.url), 'utf8')
    );
    delete report.filesRead;

    reporter.onMutationTestReportReady(report);

    expect(JSON.parse(readFileSync(fileName, 'utf8'))).toEqual({
      ...report,
      filesRead: {
        'src/types.ts': true,
        'src/covered.ts': true,
        'src/unrelated.test.ts': false,
      },
    });
    expect(report).not.toHaveProperty('filesRead');
  });
});
