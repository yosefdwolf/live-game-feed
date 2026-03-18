import { Pool } from 'pg';
import { Team, CreateTeamInput } from './teams.types';

function rowToTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    abbreviation: row.abbreviation as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

export class TeamsRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<Team[]> {
    const result = await this.pool.query(
      `SELECT id, name, abbreviation, created_at, updated_at, deleted_at
         FROM teams
        WHERE deleted_at IS NULL
        ORDER BY name ASC`,
    );
    return result.rows.map(rowToTeam);
  }

  async findById(id: string): Promise<Team | null> {
    const result = await this.pool.query(
      `SELECT id, name, abbreviation, created_at, updated_at, deleted_at
         FROM teams
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToTeam(result.rows[0]);
  }

  async create(input: CreateTeamInput): Promise<Team> {
    const result = await this.pool.query(
      `INSERT INTO teams (name, abbreviation)
       VALUES ($1, $2)
       RETURNING id, name, abbreviation, created_at, updated_at, deleted_at`,
      [input.name, input.abbreviation.toUpperCase()],
    );
    return rowToTeam(result.rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE teams SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}
