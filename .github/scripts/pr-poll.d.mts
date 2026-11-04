import type { PrStatus } from './pr-state.d.mts';

export interface PollIO {
  check: () => Promise<PrStatus[]>;
  finish: (statuses: PrStatus[], heading?: string) => never;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}

export function pollStatuses(
  options: { wait: boolean; timeout: number; interval: number },
  io: PollIO
): Promise<never>;
