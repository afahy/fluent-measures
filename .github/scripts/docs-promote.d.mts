import type { ReleaseBinding, Run } from './docs-release.mjs';
export interface VersionIndex {
  current: string;
  releases: Record<string, ReleaseBinding & { files: Record<string, string> }>;
}
export function digests(directory: string): Record<string, string>;
export function validateArchive(directory: string): VersionIndex;
export function preparePromotion(
  candidate: string,
  previous: string | undefined,
  output: string
): VersionIndex;
export function promoteDocs(
  candidate: string,
  output: string,
  options?: { repository?: string; remote?: string; run?: Run }
): void;
