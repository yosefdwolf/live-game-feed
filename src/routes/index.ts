import { Router } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { GamesController } from '../controllers/games.controller';
import { EventsController } from '../controllers/events.controller';
import { TeamsController } from '../controllers/teams.controller';
import { PlayersController } from '../controllers/players.controller';
import { ApiKeysController } from '../controllers/api-keys.controller';
import { createGamesRouter } from './games.routes';
import { createEventsRouter } from './events.routes';
import { createTeamsRouter } from './teams.routes';
import { createPlayersRouter } from './players.routes';
import { createApiKeysRouter } from './api-keys.routes';
import { successResponse } from '../shared/response/api-response';

interface RouterDeps {
  gamesController: GamesController;
  eventsController: EventsController;
  teamsController: TeamsController;
  playersController: PlayersController;
  apiKeysController: ApiKeysController;
  pool: Pool;
  redis: Redis;
}

/**
 * Mounts all API routes under /api/v1.
 * Also registers the /health endpoint at the top level.
 */
export function createApiRouter(deps: RouterDeps): Router {
  const router = Router();

  // Health check — verifies DB and Redis connectivity
  router.get('/health', async (_req, res) => {
    try {
      await deps.pool.query('SELECT 1');
      await deps.redis.ping();
      res.json({ status: 'ok', db: 'ok', redis: 'ok' });
    } catch (err) {
      const error = err as Error;
      res.status(503).json({ status: 'degraded', error: error.message });
    }
  });

  // Mount domain routers
  router.use('/teams', createTeamsRouter(deps.teamsController));
  router.use('/teams/:teamId/players', createPlayersRouter(deps.playersController));
  router.use('/games', createGamesRouter(deps.gamesController));
  router.use('/games/:gameId/events', createEventsRouter(deps.eventsController));
  router.use('/api-keys', createApiKeysRouter(deps.apiKeysController));

  return router;
}
