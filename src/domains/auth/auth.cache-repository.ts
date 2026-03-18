import Redis from 'ioredis';
import { ApiKey } from './auth.types';

const KEY_TTL_SECONDS = 300; // 5 minutes

function cacheKey(keyHash: string): string {
  return `lgf:v1:apikey:${keyHash}`;
}

export class AuthCacheRepository {
  constructor(private readonly redis: Redis) {}

  /**
   * Returns a cached ApiKey by its SHA-256 hash, or null on cache miss.
   */
  async getCachedKey(keyHash: string): Promise<ApiKey | null> {
    const raw = await this.redis.get(cacheKey(keyHash));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ApiKey;
    } catch {
      return null;
    }
  }

  /**
   * Caches an ApiKey for 5 minutes to reduce Postgres lookups on hot paths.
   */
  async setCachedKey(keyHash: string, key: ApiKey): Promise<void> {
    await this.redis.set(cacheKey(keyHash), JSON.stringify(key), 'EX', KEY_TTL_SECONDS);
  }

  /**
   * Removes a cached key immediately — called on revoke so the key stops working without waiting for TTL expiry.
   */
  async invalidateCachedKey(keyHash: string): Promise<void> {
    await this.redis.del(cacheKey(keyHash));
  }
}
