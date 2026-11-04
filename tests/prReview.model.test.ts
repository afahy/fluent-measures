import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  botChangeRequests,
  botFollowUps,
  classify,
  unansweredBotThreads,
  unansweredClaudeSummaries,
} from '../.github/scripts/pr-state.mjs';
import { ReviewModel, type Author, type ReviewEvent } from './reviewModel';

const RUNS = { seed: 199202611, numRuns: 200 };
const review = (author: Author = 'codex', oldHead = false): ReviewEvent => ({
  kind: 'review',
  author,
  changes: true,
  oldHead,
});
const say = (
  target: number,
  options: Partial<Extract<ReviewEvent, { kind: 'say' }>> = {}
): ReviewEvent => ({
  kind: 'say',
  slot: 0,
  author: 'human',
  to: 'review',
  target,
  when: 'later',
  via: 'comment',
  ...options,
});

function check(model: ReviewModel): void {
  const snapshot = model.snapshot();
  const expected = model.expected();
  const status = classify(snapshot, model.now());
  expect({
    reviews: botChangeRequests(snapshot).map(r => r.id),
    summaries: unansweredClaudeSummaries(snapshot).map(c => c.id),
    threads: unansweredBotThreads(snapshot.reviewComments).map(c => c.id),
    followUps: botFollowUps(snapshot.reviewComments).map(c => c.id),
    codex: status.codex.state,
    state: status.state,
    actions: status.actions,
  }).toEqual(expected);
}

function run(events: readonly ReviewEvent[]): ReviewModel {
  const model = new ReviewModel();
  for (const event of events) {
    model.step(event);
    check(model);
  }
  return model;
}

// Every command is executable: the prefix creates the referenced reviews, summaries and
// threads. Slots let commands edit/delete answers. No fc.pre/check can discard a transition.
const setup: ReviewEvent[] = [
  review(),
  review('claude'),
  { kind: 'summary' },
  { kind: 'summary' },
  { kind: 'thread', review: 0, author: 'codex' },
  { kind: 'thread', review: 1, author: 'claude' },
];
const identity = fc.constantFrom<Author>(
  'human',
  'deleted',
  'codex',
  'claude',
  'service',
  'suffix-bot'
);
const bot = fc.constantFrom<Author>('codex', 'claude', 'service', 'suffix-bot');
const index = fc.integer({ min: 0, max: 5 });
const comment = fc.record({
  kind: fc.constant('say' as const),
  slot: fc.integer({ min: 0, max: 3 }),
  author: identity,
  to: fc.constantFrom('review' as const, 'summary' as const, 'unrelated' as const),
  target: index,
  when: fc.constantFrom('before' as const, 'same' as const, 'later' as const),
  via: fc.constant('comment' as const),
});
const event: fc.Arbitrary<ReviewEvent> = fc.oneof(
  comment,
  comment.map(c => ({ ...c, author: 'human' as const, via: 'review' as const })),
  fc.record({
    kind: fc.constant('review' as const),
    author: bot,
    changes: fc.boolean(),
    oldHead: fc.boolean(),
  }),
  fc.constant({ kind: 'summary' as const }),
  fc.record({ kind: fc.constant('thread' as const), review: index, author: bot }),
  fc.record({ kind: fc.constant('reply' as const), thread: index, author: identity }),
  fc.record({ kind: fc.constant('delete-reply' as const), reply: index }),
  fc.record({
    kind: fc.constant('edit' as const),
    slot: fc.integer({ min: 0, max: 3 }),
    to: fc.constantFrom('review' as const, 'summary' as const, 'unrelated' as const),
    target: index,
  }),
  fc.record({ kind: fc.constant('delete' as const), slot: fc.integer({ min: 0, max: 3 }) }),
  fc.constant({ kind: 'push' as const }),
  fc.record({ kind: fc.constant('age' as const), minutes: fc.constantFrom(0, 30, 120) })
);

describe('review obligation sequences (AFA-199)', () => {
  it('retains both reviews after unrelated comments and matches IDs 1 and 12 exactly', () => {
    const model = run([review(), review(), say(0, { to: 'unrelated' })]);
    expect(model.expected().reviews).toEqual([1, 12]);
    model.step(say(1));
    check(model);
    expect(botChangeRequests(model.snapshot()).map(r => r.id)).toEqual([1]);
    model.step({ kind: 'edit', slot: 0, to: 'review', target: 0 }); // #12 is no longer answered.
    check(model);
    expect(botChangeRequests(model.snapshot()).map(r => r.id)).toEqual([12]);
    model.step({ kind: 'delete', slot: 0 });
    check(model);
    expect(botChangeRequests(model.snapshot()).map(r => r.id)).toEqual([1, 12]);
  });

  it('requires later human evidence; an edit can answer, and deletion reopens it', () => {
    const model = run([
      review(),
      say(0, { when: 'before' }),
      say(0, { when: 'same' }),
      say(0, { author: 'codex' }),
      say(0, { author: 'service' }),
      say(0, { author: 'suffix-bot' }),
      say(0, { when: 'before' }),
      { kind: 'edit', slot: 0, to: 'review', target: 0 },
    ]);
    expect(classify(model.snapshot(), model.now()).state).toBe('ready');
    model.step({ kind: 'delete', slot: 0 });
    check(model);
    expect(classify(model.snapshot(), model.now()).state).toBe('needs-agent');
    model.step(say(0, { via: 'review' }));
    check(model);
    expect(classify(model.snapshot(), model.now()).state).toBe('ready');
  });

  it('separates review bodies, individual threads and Claude summaries; follow-ups are advisory', () => {
    const model = run([
      ...setup,
      say(0),
      say(1, { slot: 1 }),
      { kind: 'reply', thread: 0, author: 'codex' },
      { kind: 'reply', thread: 0, author: 'human' },
      { kind: 'reply', thread: 0, author: 'claude' },
      { kind: 'reply', thread: 1, author: 'human' },
      say(1, { slot: 2, to: 'summary', via: 'review' }),
    ]);
    expect(model.expected().summaries).toEqual([1]);
    model.step(say(0, { slot: 3, to: 'summary' }));
    check(model);
    const status = classify(model.snapshot(), model.now());
    expect(status.state).toBe('ready');
    expect(status.reasons).toEqual([]);
    expect(status.notes).toEqual([
      expect.stringContaining('claude[bot] replied after your reply:'),
    ]);
  });

  it('discharges a review through one thread answer while each other thread still needs a reply', () => {
    const model = run([
      review(),
      { kind: 'thread', review: 0, author: 'codex' },
      { kind: 'thread', review: 0, author: 'codex' },
      { kind: 'reply', thread: 0, author: 'human' },
    ]);
    expect(model.expected()).toMatchObject({ reviews: [], threads: [12], state: 'needs-agent' });
    model.step({ kind: 'reply', thread: 1, author: 'human' });
    check(model);
    expect(classify(model.snapshot(), model.now()).state).toBe('ready');
    model.step({ kind: 'delete-reply', reply: 0 });
    check(model);
    expect(model.expected()).toMatchObject({ reviews: [], threads: [1], state: 'needs-agent' });
    model.step({ kind: 'delete-reply', reply: 0 });
    check(model);
    expect(botChangeRequests(model.snapshot()).map(r => r.id)).toEqual([1]);
  });

  it('does not count late reviews of an old head as head completion, and keeps Claude summaries', () => {
    const model = run([review(), { kind: 'summary' }, { kind: 'push' }, review('codex', true)]);
    // Current policy keys change requests by submission time, completion by commit. The late
    // old-head request still needs an answer; the earlier request does not survive the push.
    expect(model.expected()).toMatchObject({ reviews: [12], summaries: [1], codex: 'pending' });
    model.step(say(1));
    check(model);
    model.step(say(0, { slot: 1, to: 'summary' }));
    check(model);
    expect(classify(model.snapshot(), model.now()).state).toBe('waiting');
    model.step({ kind: 'age', minutes: 30 });
    check(model);
    expect(classify(model.snapshot(), model.now()).actions).toEqual(['Post `@codex review`']);
    model.step({ kind: 'age', minutes: 120 });
    check(model);
    expect(classify(model.snapshot(), model.now()).state).toBe('waiting-human');
  });

  it('checks every generated transition against the independent obligation ledger', () => {
    expect.hasAssertions();
    const executed = new Set<string>();
    let transitions = 0;
    fc.assert(
      fc.property(fc.array(event, { minLength: 1, maxLength: 50 }), events => {
        const model = run(setup);
        for (const next of events) {
          model.step(next);
          check(model);
          transitions++;
        }
        for (const kind of model.executed) executed.add(kind);
      }),
      RUNS
    );
    // These count executed transitions, including real edits/deletions, not generated commands
    // whose preconditions might skip them. The fixed seed must continue to exercise all of them.
    expect(transitions).toBeGreaterThanOrEqual(RUNS.numRuns);
    expect([...executed].sort()).toEqual([
      'age',
      'delete',
      'delete-reply',
      'deleted-answer',
      'deleted-reply',
      'edit',
      'edited-answer',
      'push',
      'reply',
      'review',
      'say',
      'summary',
      'thread',
    ]);
  });
});
