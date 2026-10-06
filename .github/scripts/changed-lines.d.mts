export function changedRanges(diff: string): Map<string, Array<[number, number]>>;

export function diffArguments(base: string, options: { fromMergeBase: boolean }): string[];

export function sourceRanges(
  ranges: Map<string, Array<[number, number]>>
): Map<string, Array<[number, number]>>;

export function mutateEntries(ranges: Map<string, Array<[number, number]>>): string[];

export interface UnkilledMutant {
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string;
  status: 'Survived' | 'NoCoverage';
}

export function unkilledMutants(report: {
  files: Record<
    string,
    {
      mutants: Array<{
        status: string;
        statusReason?: string;
        mutatorName: string;
        replacement?: string;
        location: { start: { line: number; column: number } };
      }>;
    }
  >;
}): UnkilledMutant[];

export function unexplainedIgnores(report: {
  files: Record<
    string,
    {
      mutants: Array<{
        status: string;
        statusReason?: string;
        mutatorName: string;
        location: { start: { line: number; column: number } };
      }>;
    }
  >;
}): Array<{ file: string; line: number; column: number; mutator: string }>;
