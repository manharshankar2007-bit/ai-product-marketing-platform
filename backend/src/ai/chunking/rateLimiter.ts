import type { CallEstimate, ScheduledCall } from "./types"

const WINDOW_MS = 60_000

interface WindowEntry {
  atMs: number
  tokens: number
}

/**
 * Computes when each call would be allowed to fire under a token-aware,
 * rolling 60-second window, WITHOUT actually waiting — pure simulation
 * for offline verification (Phase 1). `interCallLatencyMs` models the
 * wall-clock time a real call itself takes; Phase 2 replaces this
 * estimate with real measured latency once live calls are wired in. The
 * windowing logic itself (the part that matters for correctness) is
 * identical to what RateLimiter.waitForCapacity uses live below.
 */
export function computeSchedule(calls: CallEstimate[], budgetTokens: number, interCallLatencyMs = 1000): ScheduledCall[] {
  const log: WindowEntry[] = []
  let now = 0
  const schedule: ScheduledCall[] = []

  for (const call of calls) {
    now = admitAt(log, now, call.estimatedTokens, budgetTokens, call.index)
    log.push({ atMs: now, tokens: call.estimatedTokens })
    schedule.push({ ...call, scheduledAtMs: now })
    now += interCallLatencyMs
  }

  return schedule
}

/** Drops window entries older than 60s as of `asOfMs`, then returns the current in-window sum. */
function pruneAndSum(log: WindowEntry[], asOfMs: number): number {
  while (log.length > 0 && log[0].atMs <= asOfMs - WINDOW_MS) log.shift()
  return log.reduce((sum, e) => sum + e.tokens, 0)
}

/**
 * Returns the earliest time (>= `earliestMs`) at which `tokens` more can
 * be admitted without the rolling 60s window exceeding `budgetTokens`.
 * Throws if `tokens` alone can never fit — that's a chunk-sizing bug
 * upstream (planChunks should have caught it via ChunkTooLargeError),
 * not something the limiter should paper over by waiting forever.
 */
function admitAt(log: WindowEntry[], earliestMs: number, tokens: number, budgetTokens: number, callIndex: number): number {
  if (tokens > budgetTokens) {
    throw new Error(
      `Call ${callIndex} alone (${tokens} tokens) exceeds the rate-limit budget (${budgetTokens} tokens) — ` +
        `this should have been caught at chunk-sizing time.`,
    )
  }

  let candidate = earliestMs
  for (;;) {
    const used = pruneAndSum(log, candidate)
    if (used + tokens <= budgetTokens) return candidate
    // Advance to just after the oldest entry ages out of the window, then re-check.
    candidate = log[0].atMs + WINDOW_MS + 1
  }
}

/**
 * Live, real-time counterpart to computeSchedule — not exercised in this
 * task (zero live calls made), but built now per the Phase 1 scope
 * ("build the... rate limiter"). Tracks actual elapsed time and sleeps for
 * real; reconciles its estimate against real usage after each call.
 */
export class RateLimiter {
  private readonly log: WindowEntry[] = []
  private readonly budgetTokens: number

  constructor(budgetTokens: number) {
    this.budgetTokens = budgetTokens
  }

  /** Resolves once there is room for `estimatedTokens` in the current rolling window. */
  async waitForCapacity(estimatedTokens: number): Promise<void> {
    const now = Date.now()
    const admitAtMs = admitAt(this.log, now, estimatedTokens, this.budgetTokens, -1)
    const waitMs = admitAtMs - now
    if (waitMs > 0) {
      await sleep(waitMs)
    }
  }

  /**
   * Records the tokens actually consumed by a call, preferring the
   * response's own usage/rate-limit-header figures (source of truth) over
   * the pre-call estimate passed to waitForCapacity.
   */
  recordUsage(actualTokens: number, atMs: number = Date.now()): void {
    this.log.push({ atMs, tokens: actualTokens })
  }

  /** How many tokens are currently counted against the rolling window, as of now. */
  currentWindowUsage(): number {
    return pruneAndSum(this.log, Date.now())
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Backoff delay for a 429 response: honour retry-after first, then fall
 * back to exponential backoff for repeated failures (e.g. a retry-after
 * that turns out to be optimistic). Not exercised with real 429s in this
 * task — no live calls are made — but built per the Phase 1 scope.
 */
export function computeBackoffDelayMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    return Math.max(0, retryAfterSeconds * 1000)
  }
  const BASE_MS = 1000
  const MAX_MS = 60_000
  return Math.min(MAX_MS, BASE_MS * 2 ** attempt)
}
