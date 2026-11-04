export const DEFAULT_PAGE: string;
export const EXIT_ERROR: number;

export function findChrome(
  env: Record<string, string | undefined>,
  platform: string,
  exists?: (path: string) => boolean
): string | null;

export function pageUrl(page: string, cwd: string, isFile?: (path: string) => boolean): string;

export interface ShotOptions {
  page: string;
  width: number;
  height: number;
  scheme: 'light' | 'dark';
  full: boolean;
  out: string;
}

export function shotOptions(args: string[]): ShotOptions;

export interface SweepOptions {
  page: string;
  from: number;
  to: number;
  step: number;
  touch: boolean;
}

export function sweepOptions(args: string[]): SweepOptions;

export function sweepWidths(from: number, to: number, step: number): number[];

export function formatPlaces(
  places: Array<{ scheme: string; width: number }>,
  step: number
): string;
