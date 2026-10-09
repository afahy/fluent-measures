/** The fields that pr-state.mjs reads from GitHub's REST responses. */
export interface User {
  login: string;
  type?: string;
}

export interface Pull {
  number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed';
  merged?: boolean;
  merged_at?: string | null;
  draft?: boolean;
  mergeable_state?: string | null;
  created_at: string;
  head: { sha: string; ref: string; repo?: { full_name: string } | null };
  base: { ref: string };
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  app?: { slug: string } | null;
}

export interface CommitStatus {
  context: string;
  state: string;
  description: string | null;
  created_at: string;
}

export interface IssueComment {
  id: number;
  user: User | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface Review {
  id: number;
  user: User | null;
  state: string;
  body: string | null;
  commit_id: string;
  submitted_at?: string | null;
  html_url: string;
}

export interface ReviewComment {
  id: number;
  user: User | null;
  in_reply_to_id?: number | null;
  pull_request_review_id?: number | null;
  created_at: string;
  html_url: string;
}

export interface Reaction {
  user: User | null;
  content: string;
  created_at: string;
}

/** An entry from GET /repos/{owner}/{repo}/activity. */
export interface Activity {
  activity_type: string;
  after: string;
  timestamp: string;
}

/** An entry from GET /repos/{owner}/{repo}/issues/{number}/events. */
export interface IssueEvent {
  event: string;
  created_at: string;
}

export interface Snapshot {
  pull: Pull;
  headCommit: { committer: { date: string } };
  pushes: Activity[];
  events: IssueEvent[];
  checkRuns: CheckRun[];
  statuses: CommitStatus[];
  issueComments: IssueComment[];
  reviews: Review[];
  reviewComments: ReviewComment[];
  reactions: Reaction[];
}

export interface CiSummary {
  passed: string[];
  pending: string[];
  failed: string[];
}

export interface BotState {
  state:
    | 'done'
    | 'running'
    | 'pending'
    | 'requested'
    | 'rate-limited'
    | 'refused'
    | 'failed'
    | 'not-requested'
    | 'gave-up'
    | 'skipped';
  detail: string;
  until?: string;
  action?: string;
}

export type PrState = 'needs-agent' | 'ready' | 'merged' | 'closed' | 'waiting-human' | 'waiting';

export interface PrStatus {
  pr: number;
  title: string;
  url: string;
  state: PrState;
  head: string;
  pushedAt: string;
  mergeableState: string | null;
  reasons: string[];
  actions: string[];
  notes: string[];
  waits: string[];
  ci: CiSummary;
  codex: BotState;
  coderabbit: BotState;
}

export const CODEX: string;
export const CODERABBIT: string;
export const OWN_STATUS: string;
export const OWN_CHECK: string;
export const BOT_START_WAIT: number;
export const BOT_MAX_WAIT: number;
export const CI_START_WAIT: number;
export const STATES: Record<PrState, number>;

export function shaMatches(a: string | null | undefined, b: string | null | undefined): boolean;
export function pushedAt(snapshot: Snapshot): string;
export function clockStart(snapshot: Snapshot): string;
export function ciSummary(checkRuns: CheckRun[], statuses: CommitStatus[]): CiSummary;
export function codexSummaryRows(
  body: string
): { review: string; status: string; commit: string | null }[];
export function codexState(snapshot: Snapshot, now: number): BotState;
export function coderabbitState(snapshot: Snapshot): BotState;
export function unansweredBotThreads(comments: ReviewComment[]): ReviewComment[];
export function botFollowUps(comments: ReviewComment[]): ReviewComment[];
export function unansweredReviewBodies(snapshot: Snapshot): Review[];
export function botChangeRequests(snapshot: Snapshot): Review[];
export function botOutputSincePush(snapshot: Snapshot): string[];
export function classify(
  snapshot: Snapshot,
  now?: number,
  options?: { requests?: boolean }
): PrStatus;
export function mostUrgent(states: PrState[]): PrState;
export function digest(status: PrStatus): string;

/**
 * An error from a Client. An error from a request sets each field except, without an answer,
 * `status`. Other errors, such as a bad API URL, set none.
 */
export interface ClientError extends Error {
  /** The HTTP status, when GitHub answered. */
  status?: number;
  /** When a rate limit ends, in milliseconds since 1970, or null when it isn't a rate limit. */
  retryAt?: number | null;
  /** Whether another try can help: a network or server error, an answer that isn't JSON, or a rate limit. */
  retryable?: boolean;
  /** Whether GitHub refused the token: a 401, or a 403 that isn't a rate limit. */
  refused?: boolean;
}

export interface Client {
  get(path: string): Promise<unknown>;
  getAll(path: string, key?: string): Promise<unknown[]>;
}

export function createClient(options?: {
  token?: string | null;
  apiUrl?: string;
  fetch?: typeof fetch;
}): Client;
export function collect(api: Client, repo: string, number: number): Promise<Snapshot>;
