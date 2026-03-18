import { Pool, PoolClient } from 'pg';
import { config } from './index';

/**
 * Singleton pg connection pool.
 * statement_timeout and lock_timeout are set on every acquired connection
 * so that rogue queries fail fast rather than blocking indefinitely.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  // Applied to every connection in the pool
  // statement_timeout: 30s — kills runaway queries
  // lock_timeout: 5s — prevents lock pile-ups during migrations or contention
  options: '-c statement_timeout=30000 -c lock_timeout=5000',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle postgres client', { error: err.message });
});

/**
 * Runs `fn` inside a single serializable transaction.
 * Commits on success, rolls back on any thrown error, then re-throws.
 * All multi-write operations must use this helper to preserve atomicity.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
