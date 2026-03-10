import { logger } from "../utils/logger.js";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-memory token cache with TTL-based expiration.
 */
export class TokenStore {
  private store: Map<string, CacheEntry> = new Map();

  /**
   * Stores a value with a TTL in seconds.
   */
  set(key: string, value: unknown, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
    logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * Retrieves a value from the cache. Returns undefined if the key
   * does not exist or has expired.
   */
  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    // BUG: Using > instead of >=. When Date.now() === expiresAt,
    // the entry should be considered expired (return undefined).
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      logger.debug(`Cache expired: ${key}`);
      return undefined;
    }

    logger.debug(`Cache hit: ${key}`);
    return entry.value;
  }

  /**
   * Removes all expired entries from the cache.
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    logger.debug(`Cache cleanup: removed ${removed} expired entries`);
  }

  /**
   * Returns the number of entries currently in the cache (including expired).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.store.clear();
    logger.debug("Cache cleared");
  }
}
