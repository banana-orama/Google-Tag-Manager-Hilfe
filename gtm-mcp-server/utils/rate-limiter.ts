/**
 * Rate Limiter for GTM API.
 *
 * Goals:
 * - Keep request cadence low to avoid quota spikes.
 * - Retry transient failures (429 / 5xx / network) with exponential backoff.
 *
 * Note: Quotas can vary by project/user; this is a conservative default.
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function jitterMs(maxJitterMs: number): number {
  return Math.floor(Math.random() * maxJitterMs);
}

function isRetryableError(err: unknown): boolean {
  // googleapis typically throws GaxiosError with `response?.status`
  const anyErr = err as any;
  const status = anyErr?.response?.status ?? anyErr?.code;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;

  // Network-y cases
  const msg = String(anyErr?.message ?? '').toLowerCase();
  if (msg.includes('timeout')) return true;
  if (msg.includes('timed out')) return true;
  if (msg.includes('econnreset')) return true;
  if (msg.includes('enotfound')) return true;
  if (msg.includes('eai_again')) return true;
  return false;
}

function getRetryAfterMs(err: unknown): number | null {
  const anyErr = err as any;
  const headers = anyErr?.response?.headers;
  let raw: string | undefined;

  if (headers) {
    if (typeof headers.get === 'function') {
      raw = headers.get('retry-after') || headers.get('Retry-After') || undefined;
    } else {
      raw = headers['retry-after'] || headers['Retry-After'];
    }
  }

  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  return null;
}

export class RateLimiter {
  private queue: QueuedRequest<unknown>[] = [];
  private lastRequestTime = 0;
  private processing = false;
  private dailyCount = 0;
  private dailyResetTime = 0;

  // 4 seconds between requests (0.25 QPS)
  private readonly MIN_INTERVAL_MS = intEnv('GTM_RATE_LIMITER_MIN_INTERVAL_MS', 4000);
  // Daily limit
  private readonly DAILY_LIMIT = intEnv('GTM_RATE_LIMITER_DAILY_LIMIT', 10000);
  private readonly MAX_RETRIES = intEnv('GTM_RATE_LIMITER_MAX_RETRIES', 7);
  private readonly INITIAL_RETRY_DELAY_MS = intEnv('GTM_RATE_LIMITER_INITIAL_RETRY_DELAY_MS', 1000);
  private readonly MAX_RETRY_DELAY_MS = intEnv('GTM_RATE_LIMITER_MAX_RETRY_DELAY_MS', 180000);
  private readonly REQUEST_TIMEOUT_MS = intEnv('GTM_RATE_LIMITER_REQUEST_TIMEOUT_MS', 120000);

  constructor() {
    this.resetDailyCountIfNeeded();
  }

  /**
   * Reset daily count at midnight PST
   */
  private resetDailyCountIfNeeded(): void {
    const now = Date.now();

    // Calculate next midnight PST (UTC-8)
    const pstOffset = -8 * 60 * 60 * 1000;
    const nowPST = new Date(now + pstOffset);
    const midnightPST = new Date(nowPST);
    midnightPST.setHours(24, 0, 0, 0);
    const nextResetTime = midnightPST.getTime() - pstOffset;

    if (now >= this.dailyResetTime) {
      this.dailyCount = 0;
      this.dailyResetTime = nextResetTime;
    }
  }

  /**
   * Execute a function with rate limiting and exponential backoff
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.resetDailyCountIfNeeded();

    // Check daily limit
    if (this.dailyCount >= this.DAILY_LIMIT) {
      throw new Error(
        `Daily API limit reached (${this.DAILY_LIMIT} requests). ` +
        `Resets at midnight PST.`
      );
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  /**
   * Process queued requests respecting rate limits with retries/backoff.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.MIN_INTERVAL_MS - timeSinceLastRequest);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      const request = this.queue.shift();
      if (!request) continue;

      this.lastRequestTime = Date.now();
      this.dailyCount++;

      try {
        const result = await this.executeWithRetry(request.fn);
        request.resolve(result);
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        request.reject(e);
      }
    }

    this.processing = false;
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.withTimeout(fn(), this.REQUEST_TIMEOUT_MS);
      } catch (err) {
        attempt++;
        if (attempt > this.MAX_RETRIES || !isRetryableError(err)) {
          throw err;
        }

        const backoffBase = Math.min(
          this.MAX_RETRY_DELAY_MS,
          this.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        );

        const retryAfter = getRetryAfterMs(err);
        const delay = Math.max(backoffBase, retryAfter ?? 0) + jitterMs(500);
        console.warn(`GTM API transient error, retrying in ${delay}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
        await this.sleep(delay);
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current status
   */
  getStatus(): { dailyCount: number; dailyLimit: number; queueLength: number } {
    this.resetDailyCountIfNeeded();
    return {
      dailyCount: this.dailyCount,
      dailyLimit: this.DAILY_LIMIT,
      queueLength: this.queue.length,
    };
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
