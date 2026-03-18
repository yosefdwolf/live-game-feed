import Redis from 'ioredis';

/**
 * Flushes the entire test Redis database.
 * Only call this against a dedicated test Redis — never against production.
 */
export async function flushTestRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
