import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { createApiRouter } from './routes';
import { AuthService } from './domains/auth/auth.service';

// These are imported via the RouterDeps interface
import { Pool } from 'pg';
import Redis from 'ioredis';
import { GamesController } from './controllers/games.controller';
import { EventsController } from './controllers/events.controller';
import { TeamsController } from './controllers/teams.controller';
import { PlayersController } from './controllers/players.controller';
import { ApiKeysController } from './controllers/api-keys.controller';

interface AppDeps {
  pool: Pool;
  redis: Redis;
  authService: AuthService;
  gamesController: GamesController;
  eventsController: EventsController;
  teamsController: TeamsController;
  playersController: PlayersController;
  apiKeysController: ApiKeysController;
}

/**
 * Creates and configures the Express application.
 * Does NOT call listen — server.ts is responsible for that.
 * Pure factory function for easy testability.
 */
export function createApp(deps: AppDeps): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Body parser — 10kb limit prevents large payload attacks
  app.use(express.json({ limit: '10kb' }));

  // Correlation ID on every request
  app.use(requestIdMiddleware);

  // Expose authService via app.locals for middleware access
  // (avoids circular dependency between middleware and DI container)
  app.locals.authService = deps.authService;

  // All API routes under /api/v1
  app.use(
    '/api/v1',
    createApiRouter({
      gamesController: deps.gamesController,
      eventsController: deps.eventsController,
      teamsController: deps.teamsController,
      playersController: deps.playersController,
      apiKeysController: deps.apiKeysController,
      pool: deps.pool,
      redis: deps.redis,
    }),
  );

  // 404 handler for unknown routes
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'The requested route does not exist' },
    });
  });

  // Centralized error handler — must be last
  app.use(errorMiddleware);

  return app;
}
