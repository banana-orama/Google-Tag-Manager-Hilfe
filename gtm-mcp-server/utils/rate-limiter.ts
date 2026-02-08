/**
 * Rate Limiter for GTM API
 *
 * GTM API Limits:
 * - 10,000 requests per day per project
 * - 0.25 QPS (1 request every 4 seconds, or 25 per 100 seconds)
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class RateLimiter {
  private queue: QueuedRequest<unknown>[] = [];
  private lastRequestTime = 0;
  private processing = false;
  private dailyCount = 0;
  private dailyResetTime = 0;

  // 4 seconds between requests (0.25 QPS)
  private readonly MIN_INTERVAL_MS = 4000;
  // Daily limit
  private readonly DAILY_LIMIT = 10000;

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
   * Execute a function with rate limiting
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
   * Process queued requests respecting rate limits
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

      try {
        this.lastRequestTime = Date.now();
        this.dailyCount++;
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.processing = false;
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
