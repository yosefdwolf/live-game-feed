import { Pool, PoolClient } from 'pg';
import { Game, GameStatus, CreateGameInput, UpdateScoreInput } from './games.types';
import { decodeCursor, encodeCursor } from '../../shared/pagination/cursor';

function rowToGame(row: Record<string, unknown>): Game {
  return {
    id: row.id as string,
    homeTeamId: row.home_team_id as string,
    awayTeamId: row.away_team_id as string,
    sport: row.sport as string,
    status: row.status as GameStatus,
    homeScore: row.home_score as number,
    awayScore: row.away_score as number,
    period: row.period as number,
    clock: row.clock as string,
    scheduledAt: new Date(row.scheduled_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

const SELECT_COLUMNS = `
  id, home_team_id, away_team_id, sport, status,
  home_score, away_score, period, clock,
  scheduled_at, started_at, ended_at,
  created_at, updated_at, deleted_at
`;

export class GamesRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Returns paginated games, optionally filtered by status.
   * Uses cursor-based pagination on created_at for stable ordering at scale.
   */
  async findAll(status?: string, limit = 20, cursor?: string): Promise<Game[]> {
    const params: unknown[] = [];
    const conditions: string[] = ['deleted_at IS NULL'];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      params.push(decodedCursor);
      conditions.push(`created_at < $${params.length}`);
    }

    params.push(limit + 1); // Fetch one extra to determine if next page exists
    const where = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
         FROM games
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );

    return result.rows.map(rowToGame);
  }

  async findById(id: string): Promise<Game | null> {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM games WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToGame(result.rows[0]);
  }

  async create(input: CreateGameInput): Promise<Game> {
    const result = await this.pool.query(
      `INSERT INTO games (home_team_id, away_team_id, sport, scheduled_at)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.homeTeamId,
        input.awayTeamId,
        input.sport ?? 'basketball',
        new Date(input.scheduledAt),
      ],
    );
    return rowToGame(result.rows[0]);
  }

  async updateStatus(
    id: string,
    status: GameStatus,
    extras?: Partial<{ startedAt: Date; endedAt: Date }>,
  ): Promise<Game> {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const params: unknown[] = [id, status];

    if (extras?.startedAt) {
      params.push(extras.startedAt);
      setClauses.push(`started_at = $${params.length}`);
    }
    if (extras?.endedAt) {
      params.push(extras.endedAt);
      setClauses.push(`ended_at = $${params.length}`);
    }

    const result = await this.pool.query(
      `UPDATE games SET ${setClauses.join(', ')} WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      params,
    );
    return rowToGame(result.rows[0]);
  }

  /**
   * Updates scores atomically within an existing transaction.
   * Must receive a PoolClient rather than using the pool directly so it participates
   * in the caller's transaction boundary alongside the event insert.
   */
  async updateScore(client: PoolClient, gameId: string, input: UpdateScoreInput): Promise<void> {
    await client.query(
      `UPDATE games
          SET home_score = $2, away_score = $3, updated_at = NOW()
        WHERE id = $1`,
      [gameId, input.homeScore, input.awayScore],
    );
  }

  /**
   * Used by the cleanup job to find stale ended games for Redis eviction.
   */
  async findEndedBefore(before: Date): Promise<Game[]> {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM games WHERE ended_at < $1 AND deleted_at IS NULL`,
      [before],
    );
    return result.rows.map(rowToGame);
  }

  /**
   * Builds a cursor string from a game's created_at for pagination.
   */
  buildCursor(game: Game): string {
    return encodeCursor(game.createdAt.toISOString());
  }
}
