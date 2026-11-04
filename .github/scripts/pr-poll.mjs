// The pr:status --wait lifecycle, shared with fake IO/time tests. Policy and formatting stay
// in the CLI and pr-state.mjs; finish exits the CLI (and never returns).
import { digest } from './pr-state.mjs';

const ACTIONABLE = new Set(['needs-agent', 'ready', 'merged', 'closed']);

/** @param {number} ms */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {{ wait: boolean, timeout: number, interval: number }} options Minutes and seconds,
 *   as accepted by the CLI.
 * @param {import('./pr-poll.d.mts').PollIO} io
 * @returns {Promise<never>}
 */
export async function pollStatuses(
  { wait, timeout, interval },
  { check, finish, now = Date.now, sleep: pauseFor = sleep }
) {
  const deadline = now() + timeout * 60 * 1000;
  const started = now();

  /**
   * One poll's statuses. Without --wait, any error ends the call. With it, an error that can pass
   * is tried again after --interval, or when a rate limit ends if that is later. Five such errors
   * in a row end the call, so a rate limit that keeps coming back can't keep the call polling
   * (AFA-148). If --timeout ends before the next try, ending(error) ends the call.
   *
   * @param {(error: unknown) => never} ending
   * @returns {Promise<import('./pr-state.d.mts').PrStatus[]>}
   */
  const poll = async ending => {
    for (let failures = 1; ; failures++) {
      try {
        return await check();
      } catch (error) {
        const { retryable, retryAt } = /** @type {import('./pr-state.d.mts').ClientError} */ (
          error
        );
        if (!wait || !retryable || failures >= 5) throw error;
        const pause = Math.max((retryAt ?? 0) - now(), interval * 1000);
        if (now() + pause > deadline) ending(error);
        await pauseFor(pause);
      }
    }
  };

  // With no result yet, the error says why the call ends.
  let latest = await poll(error => {
    throw error;
  });
  if (!wait || latest.some(s => ACTIONABLE.has(s.state))) finish(latest);
  const before = new Map(latest.map(s => [s.pr, digest(s)]));
  // After a result, the end of --timeout ends the call with that result, also when it comes
  // before the next try after an error (AFA-148). Five errors in a row still end it with the
  // error.
  /** @param {unknown} [error] */
  const unchanged = error => {
    if (!error) finish(latest, `Nothing changed in ${timeout} min.`);
    const minutes = Math.round((now() - started) / 60000);
    const { message } = /** @type {Error} */ (error);
    const why = `The next try would come after --timeout: ${message}`;
    finish(latest, `Nothing changed in ${minutes} min. ${why}`);
  };
  while (now() < deadline) {
    await pauseFor(Math.min(interval * 1000, deadline - now()));
    latest = await poll(unchanged);
    const changed = latest.filter(s => s.state !== 'waiting' && digest(s) !== before.get(s.pr));
    if (changed.length > 0) {
      const minutes = Math.round((now() - started) / 60000);
      const which = changed.map(s => `#${s.pr} is now ${s.state}`).join(', ');
      finish(latest, `After ${minutes} min: ${which}.`);
    }
  }
  unchanged();
}
