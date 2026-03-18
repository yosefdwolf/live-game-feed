import Redis from 'ioredis';
import { EventUpdate } from './events.types';

function channelName(gameId: string): string {
  return `lgf:v1:game:${gameId}:events`;
}

/**
 * Publishes game events to Redis Pub/Sub.
 * The WebSocket server subscribes to these channels and fans out to connected clients.
 * This decouples the write path (POST /events) from the read path (WebSocket fans).
 */
export class EventPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(gameId: string, payload: EventUpdate): Promise<void> {
    await this.redis.publish(channelName(gameId), JSON.stringify(payload));
  }
}
