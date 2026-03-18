import { Pool, PoolClient } from 'pg';
import { GameEvent, CreateEventInput } from './events.types';
import { decodeCursor, encodeCursor } from '../../shared/pagination/cursor';

function rowToEvent(row: Record<string, unknown>): GameEvent {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    teamId: row.team_id as string | null,
    playerId: row.player_id as string | null,
    eventType: row.event_type as GameEvent['eventType'],
    scoreDelta: row.score_delta as number,
    description: row.description as string | null,
    period: row.period as number,
    clock: row.clock as string | null,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: new Date(row.created_at as string),
  };
}

const SELECT_COLUMNS = `
  id, game_id, team_id, player_id, event_type, score_delta,
  description, period, clock, metadata, created_at
`;

export class EventsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Inserts a new event into the append-only events table.
   * Must receive a PoolClient to participate in the caller's transaction —
   * the event insert and score update must be atomic.
   */
  async create(client: PoolClient, gameId: string, input: CreateEventInput): Promise<GameEvent> {
    const result = await client.query(
      `INSERT INTO events
         (game_id, team_id, player_id, event_type, score_delta, description, period, clock, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [
        gameId,
        input.teamId ?? null,
        input.playerId ?? null,
        input.eventType,
        input.scoreDelta ?? 0,
        input.description ?? null,
        input.period ?? 1,
        input.clock ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return rowToEvent(result.rows[0]);
  }

  /**
   * Returns events for a game in reverse chronological order, paginated by cursor.
   * Cursor is based on created_at DESC.
   */
  async findByGame(gameId: string, limit: number, cursor?: string): Promise<GameEvent[]> {
    const params: unknown[] = [gameId];
    const conditions = [`game_id = $1`];

    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      params.push(decodedCursor);
      conditions.push(`created_at < $${params.length}`);
    }

    params.push(limit + 1);
    const where = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS}
         FROM events
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );

    return result.rows.map(rowToEvent);
  }

  /**
   * Builds a cursor from an event's created_at for pagination responses.
   */
  buildCursor(event: GameEvent): string {
    return encodeCursor(event.createdAt.toISOString());
  }
}
