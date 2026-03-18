import { GamesRepository } from './games.repository';
import { GamesCacheRepository } from './games.cache-repository';
import { GamesPublisher } from './games.publisher';
import { TeamsRepository } from '../teams/teams.repository';
import {
  Game,
  GameState,
  GameStateSnapshot,
  CreateGameInput,
  StatusTransition,
  VALID_TRANSITIONS,
} from './games.types';
import { NotFoundError, ValidationError } from '../../shared/errors/app-errors';
import { encodeCursor } from '../../shared/pagination/cursor';

export class GamesService {
  constructor(
    private readonly gamesRepository: GamesRepository,
    private readonly gamesCacheRepository: GamesCacheRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly gamesPublisher: GamesPublisher,
  ) {}

  /**
   * Returns a paginated list of games.
   * Pagination is cursor-based on created_at — stable under concurrent inserts.
   */
  async listGames(
    status?: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ games: Game[]; nextCursor: string | null }> {
    const pageSize = Math.min(limit, 100);
    // Fetch one extra to determine if a next page exists
    const rows = await this.gamesRepository.findAll(status, pageSize + 1, cursor);

    const hasNextPage = rows.length > pageSize;
    const games = hasNextPage ? rows.slice(0, pageSize) : rows;
    const nextCursor =
      hasNextPage && games.length > 0
        ? encodeCursor(games[games.length - 1].createdAt.toISOString())
        : null;

    return { games, nextCursor };
  }

  /**
   * Returns a single game — cache-first strategy.
   * On cache miss, loads from Postgres and warms the cache for subsequent reads.
   * This is the hot-path for the 10,000:1 fan read ratio.
   */
  async getGame(id: string): Promise<Game> {
    // 1. Try Redis first — O(1) at scale
    const cached = await this.gamesCacheRepository.getGameState(id);
    if (cached) return cached;

    // 2. Fall back to Postgres
    const game = await this.gamesRepository.findById(id);
    if (!game) {
      throw new NotFoundError(`Game with id '${id}' was not found`);
    }

    // 3. Warm the cache for subsequent reads
    await this.gamesCacheRepository.setGameState(game).catch((err: Error) => {
      console.error('Failed to warm game cache', { gameId: id, error: err.message });
    });

    return game;
  }

  /**
   * Creates a new game after validating both teams exist.
   */
  async createGame(input: CreateGameInput): Promise<Game> {
    const [homeTeam, awayTeam] = await Promise.all([
      this.teamsRepository.findById(input.homeTeamId),
      this.teamsRepository.findById(input.awayTeamId),
    ]);

    if (!homeTeam) {
      throw new NotFoundError(`Home team with id '${input.homeTeamId}' was not found`);
    }
    if (!awayTeam) {
      throw new NotFoundError(`Away team with id '${input.awayTeamId}' was not found`);
    }

    const game = await this.gamesRepository.create(input);

    // Warm cache immediately so the first fan read hits Redis
    await this.gamesCacheRepository.setGameState(game).catch((err: Error) => {
      console.error('Failed to warm game cache after create', {
        gameId: game.id,
        error: err.message,
      });
    });

    return game;
  }

  /**
   * Transitions a game to a new status, validating the state machine.
   * Updates both Postgres and Redis atomically-ish (DB is source of truth).
   */
  async transitionStatus(gameId: string, newStatus: StatusTransition): Promise<Game> {
    const game = await this.gamesRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError(`Game with id '${gameId}' was not found`);
    }

    const allowedTransitions = VALID_TRANSITIONS[game.status] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition game from '${game.status}' to '${newStatus}'. ` +
          `Allowed transitions: [${allowedTransitions.join(', ') || 'none'}]`,
      );
    }

    const extras: Partial<{ startedAt: Date; endedAt: Date }> = {};
    if (newStatus === 'active') extras.startedAt = new Date();
    if (newStatus === 'final' || newStatus === 'cancelled') extras.endedAt = new Date();

    const updated = await this.gamesRepository.updateStatus(gameId, newStatus, extras);

    // Update cache to reflect new status
    await this.gamesCacheRepository.setGameState(updated).catch((err: Error) => {
      console.error('Failed to update game cache after status transition', {
        gameId,
        error: err.message,
      });
    });

    // Broadcast status change to all connected WebSocket clients
    this.gamesPublisher.publishStatusChange(gameId, newStatus).catch((err: Error) => {
      console.error('Failed to publish status_change', { gameId, error: err.message });
    });

    return updated;
  }

  /**
   * Merges a partial state patch into the game's state JSONB column,
   * then broadcasts the full merged state to all connected WebSocket clients.
   * The clock is represented as an anchor (lastStartedAt + secondsRemaining)
   * so clients compute current time locally without server ticks.
   */
  async updateGameState(gameId: string, patch: GameState): Promise<GameState> {
    const game = await this.gamesRepository.findById(gameId);
    if (!game) {
      throw new NotFoundError(`Game with id '${gameId}' was not found`);
    }

    const mergedState = await this.gamesRepository.updateState(gameId, patch);

    // Broadcast merged state to all connected fans (fire-and-forget)
    this.gamesPublisher.publishStateUpdate(gameId, mergedState).catch((err: Error) => {
      console.error('Failed to publish state_update', { gameId, error: err.message });
    });

    return mergedState;
  }

  /**
   * Returns the current live state snapshot for a game.
   * Always reads from Postgres (not cache) to guarantee freshness for new WS subscribers.
   */
  async getGameSnapshot(gameId: string): Promise<GameStateSnapshot> {
    const snapshot = await this.gamesRepository.findStateSnapshot(gameId);
    if (!snapshot) {
      throw new NotFoundError(`Game with id '${gameId}' was not found`);
    }
    return snapshot;
  }
}
