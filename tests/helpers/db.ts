import { Pool } from 'pg';

/**
 * Truncates all application tables and resets sequences.
 * Used between integration test suites to guarantee a clean state.
 * Order matters — child tables must be truncated before parents.
 */
export async function resetDb(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE events, api_keys, games, players, teams RESTART IDENTITY CASCADE
  `);
}
