import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollStatuses } from '../.github/scripts/pr-poll.mjs';
import {
  createClient,
  mostUrgent,
  STATES,
  type PrState,
  type PrStatus,
} from '../.github/scripts/pr-state.mjs';

const RUNS = { seed: 199202612, numRuns: 200 };
const EPOCH = Date.parse('2026-11-04T12:00:00Z');
type Result = { kind: 'success'; state: PrState; head: number; news: number; latency: number };
type Failure = {
  kind: 'transient' | 'network' | 'permanent' | 'refused' | 'rate';
  after: number;
  latency: number;
};
type Event = Result | Failure;
type Options = { wait: boolean; interval: number; timeout: number };
type Next =
  | { kind: 'call' }
  | { kind: 'sleep'; ms: number }
  | { kind: 'finish'; result: Result }
  | { kind: 'error'; failure: Failure };

const success = (state: PrState = 'waiting-human', news = 0): Result => ({
  kind: 'success',
  state,
  news,
  head: 1,
  latency: 0,
});
const failure = (kind: Failure['kind'] = 'rate', after = 1000): Failure => ({
  kind,
  after,
  latency: 0,
});
const codes: Record<PrState, number> = {
  ready: 0,
  'needs-agent': 10,
  waiting: 20,
  'waiting-human': 30,
  merged: 40,
  closed: 41,
};

// The model has one transition per response, no retry loop, API parsing, digest(), or clocks
// from production. Its five-error budget and status rules come from pr-status.mjs's CLI
// contract and AFA-147/148's hand-worked examples (quoted in AFA-199).
class PollModel {
  at = 0;
  failures = 0;
  latest?: Result;
  baseline?: Result;
  next: Next = { kind: 'call' };

  constructor(readonly options: Options) {}

  receive(event: Event): void {
    this.at += event.latency;
    const { wait, interval, timeout } = this.options;
    if (event.kind === 'success') {
      this.failures = 0;
      const first = !this.baseline;
      this.latest = event;
      this.baseline ??= event;
      const initialAction = first && event.state !== 'waiting' && event.state !== 'waiting-human';
      const changed =
        event.state !== 'waiting' &&
        [event.state, event.head, event.news].join('/') !==
          [this.baseline.state, this.baseline.head, this.baseline.news].join('/');
      this.next =
        !wait || initialAction || changed || this.at >= timeout
          ? { kind: 'finish', result: event }
          : { kind: 'sleep', ms: Math.min(interval, timeout - this.at) };
      return;
    }
    this.failures++;
    if (!wait || event.kind === 'permanent' || event.kind === 'refused' || this.failures === 5) {
      this.next = { kind: 'error', failure: event };
      return;
    }
    const wake = this.at + Math.max(interval, event.kind === 'rate' ? event.after : 0);
    this.next =
      wake <= timeout
        ? { kind: 'sleep', ms: wake - this.at }
        : this.latest
          ? { kind: 'finish', result: this.latest }
          : { kind: 'error', failure: event };
  }
}

// This is input adaptation, not an oracle: every status field that the loop observes is
// determined by the generated result. A news event changes notes; a push changes head.
function statuses(event: Result): PrStatus[] {
  return [
    {
      pr: 199,
      title: 'test: polling sequences',
      url: 'https://github.com/afahy/fluent-measures/pull/199',
      state: event.state,
      head: `head-${event.head}`,
      pushedAt: '2026-11-04T12:00:00Z',
      mergeableState: 'clean',
      reasons: [],
      actions: [],
      notes: [`news-${event.news}`],
      waits: [],
      ci: { passed: ['ci-ok'], pending: [], failed: [] },
      codex: { state: 'done', detail: 'Reviewed' },
    },
  ];
}

type Trace = {
  calls: number[];
  sleeps: number[];
  events: string[];
  code: number;
  heading?: string;
};

async function run(events: readonly Event[], options: Options): Promise<Trace> {
  const model = new PollModel(options);
  let now = 0;
  let position = 0;
  const trace: Trace = { calls: [], sleeps: [], events: [], code: -1 };
  const finished = new Error('finished');
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => EPOCH + now);
  // Real client classification is part of every generated transition: a 429, 503, 404, 401
  // or network exception enters the same production retry loop that the CLI uses.
  const api = createClient({
    fetch: async () => {
      expect(model.next).toEqual({ kind: 'call' });
      expect(now).toBe(model.at);
      expect(now).toBeLessThanOrEqual(options.timeout);
      if (position > Math.ceil(options.timeout / options.interval) + 1) {
        throw new Error('Unexpected unbounded polling');
      }
      trace.calls.push(now);
      // Exhausted schedules repeat a quiet waiting result, allowing the deadline to end them.
      const event = events[position++] ?? success();
      trace.events.push(event.kind);
      now += event.latency;
      model.receive(event);
      if (event.kind === 'network') throw new TypeError('fetch failed');
      if (event.kind === 'success') return new Response(JSON.stringify(statuses(event)));
      const status = { transient: 503, permanent: 404, refused: 401, rate: 429 }[event.kind];
      const headers =
        event.kind === 'rate' ? { 'retry-after': String(event.after / 1000) } : undefined;
      return new Response('Failed', { status, headers });
    },
  });
  try {
    await pollStatuses(
      { wait: options.wait, timeout: options.timeout / 60000, interval: options.interval / 1000 },
      {
        check: async () => (await api.get('/poll')) as PrStatus[],
        now: () => EPOCH + now,
        sleep: async ms => {
          expect(model.next).toEqual({ kind: 'sleep', ms });
          expect(now).toBe(model.at);
          trace.sleeps.push(ms);
          now += ms;
          model.at += ms;
          model.next = { kind: 'call' };
        },
        finish: (result, heading) => {
          expect(model.next.kind).toBe('finish');
          if (model.next.kind !== 'finish') throw new Error('Unexpected finish');
          expect(result).toEqual(statuses(model.next.result));
          trace.code = STATES[mostUrgent(result.map(s => s.state))];
          expect(trace.code).toBe(codes[model.next.result.state]);
          trace.heading = heading;
          throw finished;
        },
      }
    );
  } catch (error) {
    if (error !== finished) {
      expect(model.next.kind).toBe('error');
      if (model.next.kind !== 'error') throw error;
      const expected = model.next.failure;
      const refused = expected.kind === 'refused';
      expect(error).toMatchObject({
        refused,
        retryable: expected.kind !== 'permanent' && !refused,
      });
      trace.code = refused ? 3 : 1;
    }
  } finally {
    clock.mockRestore();
  }
  expect(trace.code).toBeGreaterThanOrEqual(0);
  return trace;
}

afterEach(() => vi.restoreAllMocks());

const latency = fc.constantFrom(0, 100, 1500);
const event: fc.Arbitrary<Event> = fc.oneof(
  fc.record({
    kind: fc.constant('success' as const),
    state: fc.constantFrom<PrState>(
      'waiting',
      'waiting-human',
      'ready',
      'needs-agent',
      'merged',
      'closed'
    ),
    head: fc.integer({ min: 1, max: 3 }),
    news: fc.integer({ min: 0, max: 2 }),
    latency,
  }),
  fc.record({
    kind: fc.constantFrom<Failure['kind']>('transient', 'network', 'permanent', 'refused', 'rate'),
    after: fc.constantFrom(0, 1000, 4000, 60000),
    latency,
  })
);
const defaults: Options = { wait: true, interval: 1000, timeout: 20000 };

describe('polling lifecycle sequences (AFA-199)', () => {
  it('keeps the last successful waiting-human result when a rate limit exceeds the deadline', async () => {
    const trace = await run([success(), failure('rate', 3600000)], { ...defaults, timeout: 3000 });
    expect(trace).toEqual({
      calls: [0, 1000],
      sleeps: [1000],
      events: ['success', 'rate'],
      code: 30,
      heading:
        'Nothing changed in 0 min. The next try would come after --timeout: GitHub answered 429 for https://api.github.com/poll: Failed',
    });
  });

  it('counts all rate limits, respects the interval, and resets the consecutive budget after success', async () => {
    const trace = await run(
      [
        failure('transient'),
        failure('rate'),
        failure('network'),
        failure('rate'),
        success(),
        failure('rate'),
        failure('transient'),
        failure('rate'),
        failure('network'),
        success('ready'),
      ],
      { ...defaults, interval: 2000, timeout: 30000 }
    );
    expect(trace.calls).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000]);
    expect(trace.sleeps).toEqual(Array(9).fill(2000));
    expect(trace.code).toBe(0);
  });

  it('stops on the fifth consecutive rate limit even with a previous result', async () => {
    const trace = await run([success(), ...Array.from({ length: 6 }, () => failure())], defaults);
    expect(trace.calls).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    expect(trace.code).toBe(1);
  });

  it.each(['permanent', 'refused'] as const)('does not retry a %s error', async kind => {
    const trace = await run([success(), failure(kind), success('ready')], defaults);
    expect(trace.calls).toEqual([0, 1000]);
    expect(trace.code).toBe(kind === 'refused' ? 3 : 1);
  });

  it('without --wait, does not retry even a transient first failure', async () => {
    const trace = await run([failure('transient'), success('ready')], { ...defaults, wait: false });
    expect(trace.calls).toEqual([0]);
    expect(trace.sleeps).toEqual([]);
    expect(trace.code).toBe(1);
  });

  it('waits for the later of Retry-After and the interval, and starts no retry after the deadline', async () => {
    const trace = await run([failure('rate', 4000), failure('rate', 0), failure('rate', 1000)], {
      ...defaults,
      interval: 2000,
      timeout: 6500,
    });
    expect(trace.calls).toEqual([0, 4000, 6000]);
    expect(trace.sleeps).toEqual([4000, 2000]);
    expect(trace.code).toBe(1);
  });

  it('keeps polling through waiting news, then returns on news for a waiting-human PR', async () => {
    const trace = await run(
      [success(), success('waiting', 1), success('waiting', 2), success('waiting-human', 2)],
      defaults
    );
    expect(trace.calls).toEqual([0, 1000, 2000, 3000]);
    expect(trace.code).toBe(30);
    expect(trace.heading).toBe('After 0 min: #199 is now waiting-human.');
  });

  it('returns the quiet result at timeout, including the final poll on the deadline', async () => {
    const trace = await run([success()], { ...defaults, timeout: 2500 });
    expect(trace.calls).toEqual([0, 1000, 2000, 2500]);
    expect(trace.sleeps).toEqual([1000, 1000, 500]);
    expect(trace.code).toBe(30);
    expect(trace.heading).toBe(`Nothing changed in ${2500 / 60000} min.`);
  });

  it('checks each executed API/time transition against the independent polling model', async () => {
    expect.hasAssertions();
    const executed = new Set<string>();
    let multiple = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(event, { minLength: 1, maxLength: 20 }),
        fc.record({
          wait: fc.constant(true),
          interval: fc.constantFrom(1000, 2000, 5000),
          timeout: fc.constantFrom(1500, 4000, 12000, 30000),
        }),
        async (events, options) => {
          const trace = await run(events, options);
          for (const kind of trace.events) executed.add(kind);
          if (trace.calls.length > 1) multiple++;
        }
      ),
      RUNS
    );
    expect([...executed].sort()).toEqual([
      'network',
      'permanent',
      'rate',
      'refused',
      'success',
      'transient',
    ]);
    expect(multiple).toBeGreaterThan(25);
  });
});
