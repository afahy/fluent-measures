// Stryker's JSON report lists only files with mutants. Include its actual file inventory so the
// changed-lines check can distinguish a type-only file from one Stryker never read or excluded.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { commonTokens, declareClassPlugin, PluginKind, tokens } from '@stryker-mutator/api/plugin';

export class MutationReport {
  static inject = tokens(commonTokens.options, commonTokens.fileDescriptions);

  constructor(options, files) {
    this.reportPath = options.jsonReporter.fileName;
    this.filesRead = Object.fromEntries(
      Object.entries(files).map(([file, description]) => [
        relative(process.cwd(), file).split(sep).join('/'),
        description.mutate,
      ])
    );
  }

  onMutationTestReportReady(report) {
    mkdirSync(dirname(this.reportPath), { recursive: true });
    writeFileSync(this.reportPath, JSON.stringify({ ...report, filesRead: this.filesRead }));
  }
}

export const strykerPlugins = [
  declareClassPlugin(PluginKind.Reporter, 'mutation-json', MutationReport),
];
