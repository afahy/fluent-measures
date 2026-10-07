export interface Finding {
  pr: number;
  title: string;
  prUrl: string;
  closed: 'merged' | 'closed';
  author: string;
  url: string;
  summary: string;
  excerpt: string;
}

export const BOTS: Set<string>;
export const LABEL: string;

export function lateFinding(name: string, event: unknown): Finding | null;
export function excerpt(body: string): string;
export function recordTitle(finding: Finding): string;
export function recordEntry(finding: Finding): string;
export function recordBody(finding: Finding): string;
export function fileOnGitHub(
  finding: Finding,
  options: { repo: string; token: string; apiUrl?: string; fetch?: typeof fetch }
): Promise<string>;
export function fileOnLinear(
  finding: Finding,
  options: { apiKey: string; teamId: string; projectId: string; fetch?: typeof fetch }
): Promise<string>;
