import { Pool } from 'pg';
import { GamesCacheRepository } from '../../domains/games/games.cache-repository';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STALE_THRESHOLD_HOURS = 2;

/**
 * Background job that evicts Redis keys for games that ended more than 2 hours ago.
 * Prevents unbounded Redis memory growth for completed games.
 *
 * The job does not use GamesService to avoid circular dependencies —
 * it queries Postgres directly via the pool.
 */
export function startCleanupJob(
  pool: Pool,
  gamesCacheRepository: GamesCacheRepository,
): NodeJS.Timeout {
  async function runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

    try {
      const result = await pool.query<{ id: string }>(
        `SELECT id FROM games WHERE ended_at < $1 AND deleted_at IS NULL`,
        [cutoff],
      );

      if (result.rows.length === 0) return;

      console.info(`Cleanup job: evicting Redis keys for ${result.rows.length} stale games`);

      await Promise.all(
        result.rows.map(({ id }) =>
          gamesCacheRepository.evictGame(id).catch((err: Error) => {
            console.error('Failed to evict game from cache', { gameId: id, error: err.message });
          }),
        ),
      );

      console.info(`Cleanup job complete: ${result.rows.length} games evicted`);
    } catch (err) {
      const error = err as Error;
      console.error('Game cleanup job failed', { error: error.message });
    }
  }

  // Run immediately on start, then on interval
  runCleanup().catch((err: Error) => {
    console.error('Initial cleanup job run failed', { error: err.message });
  });

  return setInterval(() => {
    runCleanup().catch((err: Error) => {
      console.error('Scheduled cleanup job failed', { error: err.message });
    });
  }, CLEANUP_INTERVAL_MS);
}
