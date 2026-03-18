import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

/**
 * Migration runner.
 * Reads all .sql files from the migrations/ directory in order,
 * runs each in a transaction, and records completion in schema_migrations.
 * Skips already-applied migrations so it is safe to run repeatedly.
 */
async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Lexicographic sort preserves 001_, 002_ ordering

    for (const file of files) {
      const version = file.replace('.sql', '');

      // Check if already applied
      const existing = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version],
      );

      if (existing.rows.length > 0) {
        console.info(`Skipping already applied migration: ${version}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      console.info(`Applying migration: ${version}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version],
        );
        await client.query('COMMIT');
        console.info(`Applied: ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Migration failed: ${version}`, err);
        throw err;
      }
    }

    console.info('All migrations applied successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration runner failed', err);
  process.exit(1);
});
