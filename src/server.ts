import http from 'http';
import { config } from './config';
import { pool, withTransaction } from './config/database';
import { redisClient, redisSubscriber } from './config/redis';

// Repositories
import { AuthRepository } from './domains/auth/auth.repository';
import { AuthCacheRepository } from './domains/auth/auth.cache-repository';
import { TeamsRepository } from './domains/teams/teams.repository';
import { PlayersRepository } from './domains/players/players.repository';
import { GamesRepository } from './domains/games/games.repository';
import { GamesCacheRepository } from './domains/games/games.cache-repository';
import { EventsRepository } from './domains/events/events.repository';
import { EventPublisher } from './domains/events/events.publisher';
import { GamesPublisher } from './domains/games/games.publisher';

// Services
import { AuthService } from './domains/auth/auth.service';
import { TeamsService } from './domains/teams/teams.service';
import { PlayersService } from './domains/players/players.service';
import { GamesService } from './domains/games/games.service';
import { EventsService } from './domains/events/events.service';

// Controllers
import { GamesController } from './controllers/games.controller';
import { EventsController } from './controllers/events.controller';
import { TeamsController } from './controllers/teams.controller';
import { PlayersController } from './controllers/players.controller';
import { ApiKeysController } from './controllers/api-keys.controller';

// Infrastructure
import { WsConnectionRegistry } from './infrastructure/websocket/ws-connection-registry';
import { WsMessageDispatcher } from './infrastructure/websocket/ws-message-dispatcher';
import { createWsServer } from './infrastructure/websocket/ws-server';
import { startCleanupJob } from './infrastructure/cleanup/game-cleanup.job';

import { createApp } from './app';

// ─── Dependency injection by hand ────────────────────────────────────────────
// Repositories
const authRepository = new AuthRepository(pool);
const authCacheRepository = new AuthCacheRepository(redisClient);
const teamsRepository = new TeamsRepository(pool);
const playersRepository = new PlayersRepository(pool);
const gamesRepository = new GamesRepository(pool);
const gamesCacheRepository = new GamesCacheRepository(redisClient);
const eventsRepository = new EventsRepository(pool);
const eventPublisher = new EventPublisher(redisClient);
const gamesPublisher = new GamesPublisher(redisClient);

// Services
const authService = new AuthService(authRepository, authCacheRepository);
const teamsService = new TeamsService(teamsRepository);
const playersService = new PlayersService(playersRepository, teamsRepository);
const gamesService = new GamesService(gamesRepository, gamesCacheRepository, teamsRepository, gamesPublisher);
const eventsService = new EventsService(
  eventsRepository,
  gamesRepository,
  gamesCacheRepository,
  eventPublisher,
  withTransaction,
);

// Controllers
const gamesController = new GamesController(gamesService);
const eventsController = new EventsController(eventsService);
const teamsController = new TeamsController(teamsService);
const playersController = new PlayersController(playersService);
const apiKeysController = new ApiKeysController(authService);

// ─── Express app ─────────────────────────────────────────────────────────────
const app = createApp({
  pool,
  redis: redisClient,
  authService,
  gamesController,
  eventsController,
  teamsController,
  playersController,
  apiKeysController,
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app);

const wsRegistry = new WsConnectionRegistry();
const wsDispatcher = new WsMessageDispatcher(wsRegistry);

createWsServer(server, {
  registry: wsRegistry,
  dispatcher: wsDispatcher,
  gamesService,
  gamesCacheRepository,
  redisSubscriber,
});

// ─── Background jobs ──────────────────────────────────────────────────────────
const cleanupJobTimer = startCleanupJob(pool, gamesCacheRepository);

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(config.PORT, () => {
  console.info(`Live Game Feed API running`, {
    port: config.PORT,
    env: config.NODE_ENV,
    version: config.API_VERSION,
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}. Starting graceful shutdown...`);

  clearInterval(cleanupJobTimer);

  // Stop accepting new connections
  server.close(async () => {
    console.info('HTTP server closed');
    try {
      await redisClient.quit();
      await redisSubscriber.quit();
      await pool.end();
      console.info('All connections drained. Goodbye.');
      process.exit(0);
    } catch (err) {
      const error = err as Error;
      console.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  });

  // Force exit after 30s if graceful shutdown hangs
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
