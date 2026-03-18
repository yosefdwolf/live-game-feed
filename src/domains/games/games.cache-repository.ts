import Redis from 'ioredis';
import { Game } from './games.types';

const ACTIVE_TTL = 7200;  // 2 hours in seconds
const FINAL_TTL  = 1800;  // 30 minutes in seconds

function gameStateKey(gameId: string): string {
  return `lgf:v1:game:${gameId}:state`;
}

function recentEventsKey(gameId: string): string {
  return `lgf:v1:game:${gameId}:recent_events`;
}

function fanCountKey(gameId: string): string {
  return `lgf:v1:game:${gameId}:fan_count`;
}

/**
 * Flattens a Game object for HSET storage and restores it with proper types.
 * Redis HSET stores all values as strings so we need explicit serialization.
 */
function gameToHash(game: Game): Record<string, string> {
  return {
    id: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    sport: game.sport,
    status: game.status,
    homeScore: String(game.homeScore),
    awayScore: String(game.awayScore),
    period: String(game.period),
    clock: game.clock,
    scheduledAt: game.scheduledAt.toISOString(),
    startedAt: game.startedAt ? game.startedAt.toISOString() : '',
    endedAt: game.endedAt ? game.endedAt.toISOString() : '',
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    deletedAt: game.deletedAt ? game.deletedAt.toISOString() : '',
  };
}

function hashToGame(hash: Record<string, string>): Game {
  return {
    id: hash.id,
    homeTeamId: hash.homeTeamId,
    awayTeamId: hash.awayTeamId,
    sport: hash.sport,
    status: hash.status as Game['status'],
    homeScore: parseInt(hash.homeScore, 10),
    awayScore: parseInt(hash.awayScore, 10),
    period: parseInt(hash.period, 10),
    clock: hash.clock,
    scheduledAt: new Date(hash.scheduledAt),
    startedAt: hash.startedAt ? new Date(hash.startedAt) : null,
    endedAt: hash.endedAt ? new Date(hash.endedAt) : null,
    createdAt: new Date(hash.createdAt),
    updatedAt: new Date(hash.updatedAt),
    deletedAt: hash.deletedAt ? new Date(hash.deletedAt) : null,
  };
}

export class GamesCacheRepository {
  constructor(private readonly redis: Redis) {}

  /**
   * Returns the cached game state from Redis or null on miss.
   * Uses HGETALL for O(1) full game state retrieval.
   */
  async getGameState(gameId: string): Promise<Game | null> {
    const hash = await this.redis.hgetall(gameStateKey(gameId));
    if (!hash || !hash.id) return null;
    return hashToGame(hash);
  }

  /**
   * Stores the full game state in Redis as a hash.
   * TTL varies by status: active games stay longer than finished ones.
   */
  async setGameState(game: Game): Promise<void> {
    const key = gameStateKey(game.id);
    const ttl = game.status === 'active' ? ACTIVE_TTL : FINAL_TTL;
    const hash = gameToHash(game);

    const pipeline = this.redis.pipeline();
    pipeline.hset(key, hash);
    pipeline.expire(key, ttl);
    await pipeline.exec();
  }

  async invalidateGameState(gameId: string): Promise<void> {
    await this.redis.del(gameStateKey(gameId));
  }

  /**
   * Prepends an event to the per-game recent events list (max 25).
   * LPUSH + LTRIM keeps only the most recent 25 events at O(1) amortized cost.
   */
  async pushRecentEvent(gameId: string, event: object): Promise<void> {
    const key = recentEventsKey(gameId);
    const pipeline = this.redis.pipeline();
    pipeline.lpush(key, JSON.stringify(event));
    pipeline.ltrim(key, 0, 24); // Keep max 25 events (indices 0-24)
    pipeline.expire(key, ACTIVE_TTL);
    await pipeline.exec();
  }

  async getRecentEvents(gameId: string): Promise<object[]> {
    const raw = await this.redis.lrange(recentEventsKey(gameId), 0, 24);
    return raw.map((item) => {
      try {
        return JSON.parse(item) as object;
      } catch {
        return {};
      }
    });
  }

  async incrementFanCount(gameId: string): Promise<void> {
    await this.redis.incr(fanCountKey(gameId));
  }

  async decrementFanCount(gameId: string): Promise<void> {
    await this.redis.decr(fanCountKey(gameId));
  }

  async getFanCount(gameId: string): Promise<number> {
    const raw = await this.redis.get(fanCountKey(gameId));
    return raw ? parseInt(raw, 10) : 0;
  }

  /**
   * Removes all Redis keys for a game — used by the cleanup job.
   */
  async evictGame(gameId: string): Promise<void> {
    await this.redis.del(
      gameStateKey(gameId),
      recentEventsKey(gameId),
      fanCountKey(gameId),
    );
  }
}
