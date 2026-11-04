import type { Snapshot, User } from '../.github/scripts/pr-state.mjs';

// AFA-199: a bounded ledger of obligations and typed answer targets, not a parser for GitHub
// comments. AGENTS.md and the hand-worked cases in prState*.test.ts supply these rules.
// This model imports only API types. In particular it cannot use production identity, time,
// SHA, answer or status helpers to decide its expectations.
export type Author = 'human' | 'deleted' | 'codex' | 'claude' | 'service' | 'suffix-bot';
export type Target = { kind: 'review' | 'summary'; id: number } | null;
type Review = { id: number; author: Author; head: number; at: number; changes: boolean };
type Summary = { id: number; at: number };
type Thread = { id: number; review: number; author: Author; at: number };
type Reply = { id: number; thread: number; author: Author; at: number };
type Answer = {
  id: number;
  author: Author;
  target: Target;
  created: number;
  at: number;
  via: 'comment' | 'review';
  head: number;
};

export type ReviewEvent =
  | { kind: 'review'; author: Author; changes: boolean; oldHead: boolean }
  | { kind: 'summary' }
  | { kind: 'thread'; review: number; author: Author }
  | { kind: 'reply'; thread: number; author: Author }
  | { kind: 'delete-reply'; reply: number }
  | {
      kind: 'say';
      slot: number;
      author: Author;
      to: 'review' | 'summary' | 'unrelated';
      target: number;
      when: 'before' | 'same' | 'later';
      via: 'comment' | 'review';
    }
  | { kind: 'edit'; slot: number; to: 'review' | 'summary' | 'unrelated'; target: number }
  | { kind: 'delete'; slot: number }
  | { kind: 'push' }
  | { kind: 'age'; minutes: number };

const human = (author: Author): boolean => author === 'human' || author === 'deleted';
const reviewer = (author: Author): boolean => author === 'codex' || author === 'claude';
const pick = <T>(items: T[], index: number): T => items[index % items.length];
const id = (length: number): number => [1, 12][length] ?? length + 100;
const sha = (head: number): string => (head + 1).toString(16).padStart(7, '0').padEnd(40, 'a');
const epoch = Date.parse('2026-11-04T12:00:00Z');
const time = (tick: number): string => new Date(epoch + tick * 1000).toISOString();
const url = 'https://github.com/afahy/fluent-measures/pull/199';
const user: Record<Author, User | null> = {
  human: { login: 'afahy', type: 'User' },
  deleted: null,
  codex: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
  claude: { login: 'claude[bot]', type: 'Bot' },
  service: { login: 'automation', type: 'Bot' },
  'suffix-bot': { login: 'automation[bot]', type: 'User' },
};

export class ReviewModel {
  tick = 0;
  head = 0;
  pushed = 0;
  reviews: Review[] = [];
  summaries: Summary[] = [];
  threads: Thread[] = [];
  replies: Reply[] = [];
  answers = new Map<number, Answer>();
  slots = new Map<number, number>();
  executed = new Set<string>();

  step(event: ReviewEvent): void {
    this.tick++;
    this.executed.add(event.kind);
    switch (event.kind) {
      case 'review':
        this.reviews.push({
          id: id(this.reviews.length),
          author: event.author,
          head: event.oldHead ? this.head - 1 : this.head,
          at: this.tick,
          changes: event.changes,
        });
        break;
      case 'summary':
        this.summaries.push({ id: id(this.summaries.length), at: this.tick });
        break;
      case 'thread': {
        const review = pick(this.reviews, event.review);
        this.threads.push({
          id: id(this.threads.length),
          review: review.id,
          author: event.author,
          at: this.tick,
        });
        break;
      }
      case 'reply':
        this.replies.push({
          id: 1000 + this.tick,
          thread: pick(this.threads, event.thread).id,
          author: event.author,
          at: this.tick,
        });
        break;
      case 'delete-reply':
        if (this.replies.length > 0) {
          this.replies.splice(event.reply % this.replies.length, 1);
          this.executed.add('deleted-reply');
        }
        break;
      case 'say': {
        const subject =
          event.to === 'unrelated'
            ? null
            : pick(event.to === 'review' ? this.reviews : this.summaries, event.target);
        const target: Target =
          subject && event.to !== 'unrelated' ? { kind: event.to, id: subject.id } : null;
        const at =
          subject && event.when !== 'later'
            ? subject.at - Number(event.when === 'before')
            : this.tick;
        // Slots select the last answer posted there; older answers remain in the snapshot.
        const key = 2000 + this.tick;
        this.slots.set(event.slot, key);
        this.answers.set(key, {
          id: key,
          author: event.author,
          target,
          created: at,
          at,
          via: event.via,
          head: this.head,
        });
        break;
      }
      case 'edit': {
        const answer = this.answers.get(this.slots.get(event.slot) ?? -1);
        if (answer?.via !== 'comment') break;
        const subject =
          event.to === 'unrelated'
            ? null
            : pick(event.to === 'review' ? this.reviews : this.summaries, event.target);
        answer.target =
          subject && event.to !== 'unrelated' ? { kind: event.to, id: subject.id } : null;
        answer.at = this.tick;
        this.executed.add('edited-answer');
        break;
      }
      case 'delete': {
        const key = this.slots.get(event.slot) ?? -1;
        if (this.answers.get(key)?.via === 'comment' && this.answers.delete(key)) {
          this.executed.add('deleted-answer');
        }
        break;
      }
      case 'push':
        this.head++;
        this.pushed = this.tick;
        break;
      case 'age':
        this.tick += event.minutes * 60;
        break;
    }
  }

  expected(): {
    reviews: number[];
    summaries: number[];
    threads: number[];
    followUps: number[];
    codex: string;
    state: string;
    actions: string[];
  } {
    const answered = (kind: 'review' | 'summary', subject: Summary): boolean =>
      [...this.answers.values()].some(
        a =>
          human(a.author) &&
          a.target?.kind === kind &&
          a.target.id === subject.id &&
          a.at > subject.at
      );
    const replied = new Set(this.replies.filter(r => human(r.author)).map(r => r.thread));
    const reviews = this.reviews
      .filter(
        r =>
          reviewer(r.author) &&
          r.changes &&
          r.at >= this.pushed &&
          !answered('review', r) &&
          !this.threads.some(t => t.review === r.id && replied.has(t.id))
      )
      .map(r => r.id);
    const summaries = this.summaries.filter(s => !answered('summary', s)).map(s => s.id);
    const threads = this.threads
      .filter(t => reviewer(t.author) && !replied.has(t.id))
      .map(t => t.id);
    const followUps = this.replies
      .filter(
        (r, index) =>
          replied.has(r.thread) &&
          reviewer(r.author) &&
          !this.replies.slice(index + 1).some(later => later.thread === r.thread)
      )
      .map(r => r.id);
    const done = this.reviews.some(r => r.author === 'codex' && r.head === this.head);
    const age = this.tick - this.pushed;
    const codex = done
      ? 'done'
      : age >= 7200
        ? 'gave-up'
        : age >= 1800
          ? 'not-requested'
          : 'pending';
    const actions = codex === 'not-requested' ? ['Post `@codex review`'] : [];
    const state =
      reviews.length + summaries.length + threads.length + actions.length > 0
        ? 'needs-agent'
        : done
          ? 'ready'
          : codex === 'gave-up'
            ? 'waiting-human'
            : 'waiting';
    return { reviews, summaries, threads, followUps, codex, state, actions };
  }

  now(): number {
    return epoch + this.tick * 1000;
  }

  // The adapter writes links and API fields; it makes no decisions about eligible answers.
  // Structured targets in expected() never read back or parse these generated strings.
  snapshot(): Snapshot {
    const answers = [...this.answers.values()];
    const body = (a: Answer): string =>
      a.target
        ? `Agent: Fixed ${url}#${a.target.kind === 'review' ? 'pullrequestreview' : 'issuecomment'}-${a.target.id}.`
        : 'Agent: CI is running.';
    return {
      pull: {
        number: 199,
        title: 'test: review sequences',
        html_url: url,
        state: 'open',
        mergeable_state: 'clean',
        created_at: time(0),
        head: { sha: sha(this.head), ref: 'feature' },
        base: { ref: 'main' },
      },
      headCommit: { committer: { date: time(0) } },
      pushes: [{ activity_type: 'push', after: sha(this.head), timestamp: time(this.pushed) }],
      events: [],
      checkRuns: ['ci-ok', 'Claude review'].map((name, i) => ({
        id: i + 1,
        name,
        status: 'completed',
        conclusion: 'success',
        started_at: time(this.pushed),
      })),
      statuses: [],
      reactions: [],
      reviews: [
        ...this.reviews.map(r => ({
          id: r.id,
          user: user[r.author],
          state: r.changes ? 'CHANGES_REQUESTED' : 'COMMENTED',
          body: 'Review findings',
          commit_id: sha(r.head),
          submitted_at: time(r.at),
          html_url: `${url}#pullrequestreview-${r.id}`,
        })),
        ...answers
          .filter(a => a.via === 'review')
          .map(a => ({
            id: a.id,
            user: user[a.author],
            state: 'COMMENTED',
            body: body(a),
            commit_id: sha(a.head),
            submitted_at: time(a.at),
            html_url: `${url}#pullrequestreview-${a.id}`,
          })),
      ],
      issueComments: [
        ...this.summaries.map(s => ({
          id: s.id,
          user: { login: 'github-actions[bot]', type: 'Bot' },
          body: 'Claude review summary',
          created_at: time(s.at),
          updated_at: time(s.at),
          html_url: `${url}#issuecomment-${s.id}`,
        })),
        ...answers
          .filter(a => a.via === 'comment')
          .map(a => ({
            id: a.id,
            user: user[a.author],
            body: body(a),
            created_at: time(a.created),
            updated_at: time(a.at),
            html_url: `${url}#issuecomment-${a.id}`,
          })),
      ],
      reviewComments: [
        ...this.threads.map(t => ({
          id: t.id,
          user: user[t.author],
          pull_request_review_id: t.review,
          created_at: time(t.at),
          html_url: `${url}#discussion_r${t.id}`,
        })),
        ...this.replies.map(r => ({
          id: r.id,
          user: user[r.author],
          in_reply_to_id: r.thread,
          created_at: time(r.at),
          html_url: `${url}#discussion_r${r.id}`,
        })),
      ],
    };
  }
}
