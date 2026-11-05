// Capture Stryker's actual project selection through its public reporter API. The caller runs
// a cold dry run, then independently instruments that full selection to count even untested
// mutants. A union of shard reports alone cannot prove that no mutant was omitted.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { commonTokens, declareClassPlugin, PluginKind, tokens } from '@stryker-mutator/api/plugin';

const require = createRequire(createRequire(import.meta.url).resolve('@stryker-mutator/core'));
let captured;
export class MutationInventory {
  static inject = tokens(commonTokens.options, commonTokens.fileDescriptions, commonTokens.logger);
  constructor(options, files, logger) {
    captured = { options, files, logger };
  }
}
export const strykerPlugins = [
  declareClassPlugin(PluginKind.Reporter, 'mutation-inventory', MutationInventory),
];

export const relativeFile = file => relative(process.cwd(), file).split(sep).join('/');
export const mutantKey = (file, mutant) =>
  JSON.stringify([
    file,
    mutant.location.start.line,
    mutant.location.start.column,
    mutant.location.end.line,
    mutant.location.end.column,
    mutant.mutatorName,
    mutant.replacement,
  ]);

export async function fullInventory() {
  if (!captured) throw new Error('Stryker never supplied its file inventory');
  const { options, files, logger } = captured;
  if (options.ignorers.length) throw new Error('Inventory does not support custom ignorers');
  const selected = Object.entries(files).filter(([, description]) => description.mutate !== false);
  if (!selected.length || selected.some(([, description]) => description.mutate !== true)) {
    throw new Error('Inventory requires the full mutation selection, without ranges');
  }
  const sources = selected.map(([name]) => ({
    name,
    content: readFileSync(name, 'utf8'),
    mutate: true,
  }));
  const { Instrumenter } = await import(
    pathToFileURL(require.resolve('@stryker-mutator/instrumenter'))
  );
  const { mutants } = await new Instrumenter(logger).instrument(sources, {
    ignorers: [],
    ...options.mutator,
  });
  return {
    filesRead: Object.fromEntries(
      Object.entries(files).map(([file, description]) => [relativeFile(file), description.mutate])
    ),
    files: Object.fromEntries(
      sources.map(file => [relativeFile(file.name), { source: file.content, mutants: [] }])
    ),
    mutants: mutants.map(mutant => {
      const location = Object.fromEntries(
        Object.entries(mutant.location).map(([end, position]) => [
          end,
          { line: position.line + 1, column: position.column + 1 },
        ])
      );
      return mutantKey(relativeFile(mutant.fileName), { ...mutant, location });
    }),
  };
}
