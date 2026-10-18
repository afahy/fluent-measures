export interface ResultChange {
  input: string;
  options: string;
  before: string;
  after: string;
}

export interface ResultChanges {
  changed: ResultChange[];
  added: number;
  removed: number;
}

export interface CorpusReport {
  /** The counts in each row of the score table, as "total agree wrong missed throws". */
  rows: Map<string, string>;
  /** The outcome of each entry that the report lists, with its output when it shows one. */
  outcomes: Map<string, string>;
}

export interface CorpusChanges {
  outcomes: { id: string; before: string; after: string }[];
  edited: string[];
  removed: string[];
  added: number;
  rows: { name: string; before: string; after: string }[];
}

export interface Size {
  name: string;
  before: number | null;
  after: number;
}

export interface Facts {
  results: ResultChanges;
  corpus: CorpusChanges;
  examples: { removed: string[]; added: string[] };
  snapshotTestChanged: boolean;
  apiChanged: boolean;
  packageChanged: boolean;
  consumerFields: string[];
  deletedTests: string[];
  loweredLimits: string[];
  settingsChanged: boolean;
  ignores: string[];
  ciChanged: string[];
  removedExpects: number;
  sizeRaises: number[];
  removedBudgets: string[];
  codeChanged: string[];
  sizes: Size[];
}

export function parseResults(text: string | null): Map<string, string>;
export function resultChanges(base: Map<string, string>, head: Map<string, string>): ResultChanges;
export function parseCorpus(text: string | null): Map<string, string>;
export function parseCorpusReport(text: string | null): CorpusReport;
export function corpusChanges(
  base: { entries: Map<string, string>; report: CorpusReport },
  head: { entries: Map<string, string>; report: CorpusReport }
): CorpusChanges;
export function exampleLines(markdown: string | null): string[];
export function exampleChanges(
  base: string[],
  head: string[]
): { removed: string[]; added: string[] };
export function consumerFieldChanges(base: string | null, head: string | null): string[];
export function sizeLimits(text: string | null): Map<string, number>;
export function sizeChanges(
  base: Map<string, number>,
  head: Map<string, number>
): { raises: number[]; removed: string[] };
export const SETTINGS: string[];
export function testSettings(files: Record<string, string | null>): string;
export function removedExpects(diff: string): number;
export function deletedTests(status: { kind: string; path: string; to?: string }[]): string[];
export function addedIgnores(diff: string): string[];
export function nameStatus(output: string): { kind: string; path: string; to?: string }[];
export function scriptsRun(workflows: string[], read: (path: string) => string | null): Set<string>;
export function testLimits(stryker: string | null, vitest: string | null): Map<string, number>;
export function listsChangedResults(body: string): boolean;
export function assessRisk(facts: Facts): { level: 'low' | 'medium' | 'high'; reasons: string[] };
export function summary(facts: Facts, risk: { level: string; reasons: string[] }): string;
export function sizes(base: string | null, head: string | null): Size[];
