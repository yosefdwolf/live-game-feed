import crypto from 'crypto';
import { Pool } from 'pg';

/**
 * Seeds sample data for development and demo purposes.
 * Creates 2 teams, 5 players each, 1 scheduled game, and 1 admin API key.
 * The raw admin key is logged once to the console — store it immediately.
 */
async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ─── Teams ─────────────────────────────────────────────────────────────
    const homeTeamResult = await client.query<{ id: string }>(
      `INSERT INTO teams (name, abbreviation)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Springfield Spitfires', 'SSF'],
    );

    const awayTeamResult = await client.query<{ id: string }>(
      `INSERT INTO teams (name, abbreviation)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Shelbyville Sharks', 'SHS'],
    );

    // If teams already exist, look them up
    const homeTeam = homeTeamResult.rows[0] ?? (
      await client.query<{ id: string }>(`SELECT id FROM teams WHERE abbreviation = 'SSF'`)
    ).rows[0];

    const awayTeam = awayTeamResult.rows[0] ?? (
      await client.query<{ id: string }>(`SELECT id FROM teams WHERE abbreviation = 'SHS'`)
    ).rows[0];

    if (!homeTeam || !awayTeam) {
      throw new Error('Failed to find or create teams');
    }

    console.info(`Home team id: ${homeTeam.id}`);
    console.info(`Away team id: ${awayTeam.id}`);

    // ─── Players ────────────────────────────────────────────────────────────
    const homePlayers = [
      { name: 'Alex Johnson', jerseyNumber: 10, position: 'Point Guard' },
      { name: 'Marcus Williams', jerseyNumber: 23, position: 'Shooting Guard' },
      { name: 'Devon Carter', jerseyNumber: 34, position: 'Small Forward' },
      { name: 'Isaiah Thompson', jerseyNumber: 45, position: 'Power Forward' },
      { name: 'Tyrone Davis', jerseyNumber: 5, position: 'Center' },
    ];

    const awayPlayers = [
      { name: 'Jordan Mitchell', jerseyNumber: 7, position: 'Point Guard' },
      { name: 'Darius Robinson', jerseyNumber: 21, position: 'Shooting Guard' },
      { name: 'Elijah Brooks', jerseyNumber: 33, position: 'Small Forward' },
      { name: 'Nathan Cooper', jerseyNumber: 44, position: 'Power Forward' },
      { name: 'Calvin Reed', jerseyNumber: 3, position: 'Center' },
    ];

    for (const p of homePlayers) {
      await client.query(
        `INSERT INTO players (team_id, name, jersey_number, position)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [homeTeam.id, p.name, p.jerseyNumber, p.position],
      );
    }

    for (const p of awayPlayers) {
      await client.query(
        `INSERT INTO players (team_id, name, jersey_number, position)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [awayTeam.id, p.name, p.jerseyNumber, p.position],
      );
    }

    // ─── Game ────────────────────────────────────────────────────────────────
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0);

    const gameResult = await client.query<{ id: string }>(
      `INSERT INTO games (home_team_id, away_team_id, sport, scheduled_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [homeTeam.id, awayTeam.id, 'basketball', tomorrow],
    );

    const gameId = gameResult.rows[0].id;
    console.info(`Game id: ${gameId}`);

    // ─── Admin API Key ────────────────────────────────────────────────────────
    const rawKey = `lgf_v1_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await client.query(
      `INSERT INTO api_keys (key_hash, label, game_id)
       VALUES ($1, $2, NULL)`,
      [keyHash, 'Seed Admin Key'],
    );

    // ─── Game-scoped coach key ────────────────────────────────────────────────
    const coachRawKey = `lgf_v1_${crypto.randomBytes(32).toString('hex')}`;
    const coachKeyHash = crypto.createHash('sha256').update(coachRawKey).digest('hex');

    await client.query(
      `INSERT INTO api_keys (key_hash, label, game_id)
       VALUES ($1, $2, $3)`,
      [coachKeyHash, 'Seed Coach Key', gameId],
    );

    await client.query('COMMIT');

    // ─── Log raw keys — never stored ─────────────────────────────────────────
    console.info('\n=== SEED COMPLETE ===');
    console.info('\nAdmin API Key (store this — shown once):');
    console.info(rawKey);
    console.info('\nCoach API Key for game', gameId, '(store this — shown once):');
    console.info(coachRawKey);
    console.info('\nGame ID:', gameId);
    console.info('=====================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
