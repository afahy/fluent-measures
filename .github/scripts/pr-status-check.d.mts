import type { Client, PrStatus } from './pr-state.d.mts';

export const COMMIT_STATES: Record<string, 'success' | 'failure' | 'pending'>;
export function describeStatus(status: PrStatus): string;
export function prsForEvent(
  api: Client,
  repo: string,
  name: string,
  event: unknown
): Promise<number[]>;
export function setStatus(
  api: Client,
  post: (path: string, body: unknown) => Promise<unknown>,
  repo: string,
  number: number,
  now?: number
): Promise<{ state: string; description: string } | null>;
