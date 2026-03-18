import { Pool } from 'pg';
import { Player, CreatePlayerInput } from './players.types';
import { ConflictError } from '../../shared/errors/app-errors';

const PG_UNIQUE_VIOLATION = '23505';

function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    name: row.name as string,
    jerseyNumber: row.jersey_number as number,
    position: row.position as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

export class PlayersRepository {
  constructor(private readonly pool: Pool) {}

  async findByTeam(teamId: string): Promise<Player[]> {
    const result = await this.pool.query(
      `SELECT id, team_id, name, jersey_number, position, created_at, updated_at, deleted_at
         FROM players
        WHERE team_id = $1 AND deleted_at IS NULL
        ORDER BY jersey_number ASC`,
      [teamId],
    );
    return result.rows.map(rowToPlayer);
  }

  async findById(id: string): Promise<Player | null> {
    const result = await this.pool.query(
      `SELECT id, team_id, name, jersey_number, position, created_at, updated_at, deleted_at
         FROM players
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToPlayer(result.rows[0]);
  }

  /**
   * Creates a player on a team.
   * Catches Postgres unique constraint violations on (team_id, jersey_number)
   * and converts them to domain-level ConflictErrors.
   */
  async create(teamId: string, input: CreatePlayerInput): Promise<Player> {
    try {
      const result = await this.pool.query(
        `INSERT INTO players (team_id, name, jersey_number, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id, team_id, name, jersey_number, position, created_at, updated_at, deleted_at`,
        [teamId, input.name, input.jerseyNumber, input.position ?? null],
      );
      return rowToPlayer(result.rows[0]);
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictError(
          `Jersey number ${input.jerseyNumber} is already taken on this team`,
        );
      }
      throw err;
    }
  }
}
