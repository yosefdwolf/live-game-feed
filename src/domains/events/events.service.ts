import { PoolClient } from 'pg';
import { EventsRepository } from './events.repository';
import { GamesRepository } from '../games/games.repository';
import { GamesCacheRepository } from '../games/games.cache-repository';
import { EventPublisher } from './events.publisher';
import { GameEvent, CreateEventInput, EventUpdate } from './events.types';
import { NotFoundError, ValidationError, ForbiddenError } from '../../shared/errors/app-errors';
import { encodeCursor } from '../../shared/pagination/cursor';
import { AuthContext } from '../../types/express';

type WithTransactionFn = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly gamesRepository: GamesRepository,
    private readonly gamesCacheRepository: GamesCacheRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly withTransaction: WithTransactionFn,
  ) {}

  /**
   * Core write path: submits a game event.
   *
   * Orchestration:
   * 1. Validate game exists and is active
   * 2. Validate key authorization scope
   * 3. Atomically insert event + update denormalized score in one DB transaction
   * 4. Post-commit: update Redis cache (fire-and-forget)
   * 5. Post-commit: push to recent events list (fire-and-forget)
   * 6. Post-commit: publish to Redis Pub/Sub for WebSocket fan-out (fire-and-forget)
   *
   * Cache failures after commit do NOT cause a rollback — the DB transaction is the
   * source of truth. Cache inconsistency is self-healing on next DB fallback read.
   */
  async submitEvent(
    gameId: string,
    authContext: AuthContext,
    input: CreateEventInput,
  ): Promise<GameEvent> {
    // 1. Verify game exists and is active
    const game = await this.gamesRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError(`Game with id '${gameId}' was not found`);
    }
    if (game.status !== 'active') {
      throw new ValidationError(
        `Cannot submit events for a game with status '${game.status}'. Game must be active.`,
      );
    }

    // 2. If game-scoped key, it must match the target game
    if (!authContext.isAdmin && authContext.gameId !== gameId) {
      throw new ForbiddenError(
        'This API key is not authorized to submit events for this game',
      );
    }

    let newEvent!: GameEvent;
    let newHomeScore = game.homeScore;
    let newAwayScore = game.awayScore;

    // 3. Atomic transaction: insert event + update scores
    await this.withTransaction(async (client) => {
      newEvent = await this.eventsRepository.create(client, gameId, input);

      const delta = input.scoreDelta ?? 0;
      if (delta !== 0 && input.teamId) {
        // Score delta is attributed to the team that performed the event
        if (input.teamId === game.homeTeamId) {
          newHomeScore = game.homeScore + delta;
        } else if (input.teamId === game.awayTeamId) {
          newAwayScore = game.awayScore + delta;
        }
      } else if (delta !== 0) {
        // No team specified — apply delta to home score as fallback
        newHomeScore = game.homeScore + delta;
      }

      await this.gamesRepository.updateScore(client, gameId, {
        homeScore: Math.max(0, newHomeScore),
        awayScore: Math.max(0, newAwayScore),
      });
    });

    // Build the updated game state for publishing
    const updatedGameState = {
      ...game,
      homeScore: Math.max(0, newHomeScore),
      awayScore: Math.max(0, newAwayScore),
    };

    const eventUpdate: EventUpdate = {
      type: 'event_update',
      event: newEvent,
      gameState: {
        homeScore: updatedGameState.homeScore,
        awayScore: updatedGameState.awayScore,
        period: updatedGameState.period,
        clock: updatedGameState.clock,
        status: updatedGameState.status,
      },
    };

    // 4. Post-commit: update Redis game state cache
    this.gamesCacheRepository.setGameState(updatedGameState).catch((err: Error) => {
      console.error('Failed to update game cache after event submit', {
        gameId,
        error: err.message,
      });
    });

    // 5. Post-commit: push to recent events list for catch-up
    this.gamesCacheRepository.pushRecentEvent(gameId, newEvent).catch((err: Error) => {
      console.error('Failed to push recent event to cache', { gameId, error: err.message });
    });

    // 6. Post-commit: fan-out via Redis Pub/Sub → WebSocket
    this.eventPublisher.publish(gameId, eventUpdate).catch((err: Error) => {
      console.error('Failed to publish event to Redis', { gameId, error: err.message });
    });

    return newEvent;
  }

  /**
   * Returns paginated events for a game in reverse chronological order.
   */
  async listEvents(
    gameId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ events: GameEvent[]; nextCursor: string | null }> {
    // Verify game exists
    const game = await this.gamesRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError(`Game with id '${gameId}' was not found`);
    }

    const pageSize = Math.min(limit, 100);
    const rows = await this.eventsRepository.findByGame(gameId, pageSize, cursor);

    const hasNextPage = rows.length > pageSize;
    const events = hasNextPage ? rows.slice(0, pageSize) : rows;
    const nextCursor =
      hasNextPage && events.length > 0
        ? encodeCursor(events[events.length - 1].createdAt.toISOString())
        : null;

    return { events, nextCursor };
  }
}
