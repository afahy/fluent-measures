export interface ReleaseBinding {
  version: string;
  revision: string;
  integrity: string;
  verification: string;
}
export type Run = (
  tool: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }
) => string;
export const site: string;
export const packageName: string;
export const documents: string[];
export function releaseVersion(version: string): string;
export function command(...args: Parameters<Run>): string;
export function fileList(directory: string): string[];
export function verifyPackage(
  source: string,
  installed: string,
  version: string,
  metadata: {
    name: string;
    version: string;
    gitHead?: string;
    dist: { integrity: string };
  },
  revision: string
): void;
export function releaseGuidance(version: string): string;
export function buildReleaseDocs(source: string, output: string, binding: ReleaseBinding): void;
export function verifyRelease(
  version: string,
  options?: { repository?: string; output?: string; run?: Run }
): string;
