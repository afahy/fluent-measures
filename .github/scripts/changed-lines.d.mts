export function revisions(base: string, options: { fromMergeBase: boolean }): string[];

export function isSourceFile(file: string): boolean;

export function hunkRanges(diff: string): Array<[number, number]>;

export interface ReportMutant {
  status: string;
  statusReason?: string;
  mutatorName: string;
  replacement?: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface Report {
  files: Record<string, { mutants: ReportMutant[] }>;
}

export interface UnkilledMutant {
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string;
  status: 'Survived' | 'NoCoverage';
}

export function unkilledMutants(
  report: Report,
  changed: Map<string, Array<[number, number]>>
): UnkilledMutant[];

export function unexplainedIgnores(
  report: Report,
  changed: Map<string, Array<[number, number]>>
): Array<{ file: string; line: number; column: number; mutator: string }>;
