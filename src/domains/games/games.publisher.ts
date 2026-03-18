import Redis from 'ioredis';
import { GameState } from './games.types';

function channelName(gameId: string): string {
  return `lgf:v1:game:${gameId}:events`;
}

/**
 * Publishes game-level state and status changes to Redis Pub/Sub.
 * Uses the same channel as EventPublisher so the WebSocket server receives
 * all game-related messages through a single subscription per game.
 *
 * The `type` field in each message tells the WS server which WsMessage
 * type to use when forwarding to connected clients.
 */
export class GamesPublisher {
  constructor(private readonly redis: Redis) {}

  async publishStateUpdate(gameId: string, state: GameState): Promise<void> {
    await this.redis.publish(
      channelName(gameId),
      JSON.stringify({ type: 'state_update', state }),
    );
  }

  async publishStatusChange(gameId: string, status: string): Promise<void> {
    await this.redis.publish(
      channelName(gameId),
      JSON.stringify({ type: 'status_change', status }),
    );
  }
}
