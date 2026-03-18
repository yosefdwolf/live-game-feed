import Redis from 'ioredis';
import { config } from './index';

function createRetryStrategy(maxRetries: number) {
  return (times: number): number | null => {
    if (times > maxRetries) {
      console.error('Redis max retries reached, giving up');
      return null; // Stop retrying
    }
    // Exponential backoff: 200ms, 400ms, 800ms
    const delay = Math.min(200 * Math.pow(2, times - 1), 3000);
    console.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  };
}

function createRedisClient(name: string): Redis {
  const client = new Redis(config.REDIS_URL, {
    retryStrategy: createRetryStrategy(3),
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  client.on('connect', () => {
    console.info(`Redis ${name} connected`);
  });

  client.on('error', (err: Error) => {
    console.error(`Redis ${name} error`, { error: err.message });
  });

  client.on('close', () => {
    console.warn(`Redis ${name} connection closed`);
  });

  return client;
}

/**
 * Primary Redis client for GET/SET/PUBLISH commands.
 * A subscribed client cannot issue regular commands — they are separate instances.
 */
export const redisClient = createRedisClient('PUB');

/**
 * Dedicated subscriber client.
 * Once SUBSCRIBE is called, this client can only receive messages.
 */
export const redisSubscriber = createRedisClient('SUB');
