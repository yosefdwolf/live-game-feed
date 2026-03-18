/**
 * End-to-end test: full live game flow.
 *
 * Scenario:
 * 1. Create team1, team2
 * 2. Create a game (admin key)
 * 3. Generate a game-scoped coach key
 * 4. Connect a WebSocket fan client to /ws/games/:gameId
 * 5. Transition game to active
 * 6. Submit a basket event (coach key)
 * 7. Assert WebSocket client receives event_update with updated score
 * 8. Transition game to final
 * 9. Assert WebSocket client receives status_change
 *
 * Requires: TEST_DATABASE_URL, TEST_REDIS_URL (or DATABASE_URL, REDIS_URL)
 * Skip automatically if not available.
 */

import http from 'http';
import request from 'supertest';
import WebSocket from 'ws';
import { Pool } from 'pg';
import { Application } from 'express';
import crypto from 'crypto';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
const SKIP = !TEST_DATABASE_URL || !TEST_REDIS_URL;

function waitForWsMessage(
  ws: WebSocket,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for WebSocket message`));
    }, timeoutMs);

    const handler = (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // ignore parse errors — keep waiting
      }
    };

    ws.on('message', handler);
  });
}

async function createE2EApp(): Promise<{
  app: Application;
  server: http.Server;
  pool: Pool;
  adminKey: string;
  cleanup: () => Promise<void>;
}> {
  const { Pool: PgPool } = await import('pg');
  const Redis = (await import('ioredis')).default;
  const { createWsServer } = await import('../../src/infrastructure/websocket/ws-server');
  const { WsConnectionRegistry } = await import('../../src/infrastructure/websocket/ws-connection-registry');
  const { WsMessageDispatcher } = await import('../../src/infrastructure/websocket/ws-message-dispatcher');

  const pool = new PgPool({ connectionString: TEST_DATABASE_URL });
  const redisClient = new Redis(TEST_REDIS_URL!);
  const redisSubscriber = new Redis(TEST_REDIS_URL!);

  await pool.query(
    `TRUNCATE events, api_keys, games, players, teams RESTART IDENTITY CASCADE`,
  );
  await redisClient.flushdb();

  // Admin key
  const rawAdminKey = `lgf_v1_${crypto.randomBytes(32).toString('hex')}`;
  const adminKeyHash = crypto.createHash('sha256').update(rawAdminKey).digest('hex');
  await pool.query(
    `INSERT INTO api_keys (key_hash, label) VALUES ($1, 'E2E Admin Key')`,
    [adminKeyHash],
  );

  const { withTransaction } = await import('../../src/config/database');
  const { AuthRepository } = await import('../../src/domains/auth/auth.repository');
  const { AuthCacheRepository } = await import('../../src/domains/auth/auth.cache-repository');
  const { TeamsRepository } = await import('../../src/domains/teams/teams.repository');
  const { PlayersRepository } = await import('../../src/domains/players/players.repository');
  const { GamesRepository } = await import('../../src/domains/games/games.repository');
  const { GamesCacheRepository } = await import('../../src/domains/games/games.cache-repository');
  const { EventsRepository } = await import('../../src/domains/events/events.repository');
  const { EventPublisher } = await import('../../src/domains/events/events.publisher');
  const { AuthService } = await import('../../src/domains/auth/auth.service');
  const { TeamsService } = await import('../../src/domains/teams/teams.service');
  const { PlayersService } = await import('../../src/domains/players/players.service');
  const { GamesService } = await import('../../src/domains/games/games.service');
  const { EventsService } = await import('../../src/domains/events/events.service');
  const { GamesController } = await import('../../src/controllers/games.controller');
  const { EventsController } = await import('../../src/controllers/events.controller');
  const { TeamsController } = await import('../../src/controllers/teams.controller');
  const { PlayersController } = await import('../../src/controllers/players.controller');
  const { ApiKeysController } = await import('../../src/controllers/api-keys.controller');
  const { createApp } = await import('../../src/app');

  const authRepository = new AuthRepository(pool);
  const authCacheRepository = new AuthCacheRepository(redisClient);
  const teamsRepository = new TeamsRepository(pool);
  const playersRepository = new PlayersRepository(pool);
  const gamesRepository = new GamesRepository(pool);
  const gamesCacheRepository = new GamesCacheRepository(redisClient);
  const eventsRepository = new EventsRepository(pool);
  const eventPublisher = new EventPublisher(redisClient);

  const authService = new AuthService(authRepository, authCacheRepository);
  const teamsService = new TeamsService(teamsRepository);
  const playersService = new PlayersService(playersRepository, teamsRepository);
  const gamesService = new GamesService(gamesRepository, gamesCacheRepository, teamsRepository);
  const eventsService = new EventsService(
    eventsRepository,
    gamesRepository,
    gamesCacheRepository,
    eventPublisher,
    withTransaction,
  );

  const gamesController = new GamesController(gamesService);
  const eventsController = new EventsController(eventsService);
  const teamsController = new TeamsController(teamsService);
  const playersController = new PlayersController(playersService);
  const apiKeysController = new ApiKeysController(authService);

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

  const cleanup = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await redisClient.quit();
    await redisSubscriber.quit();
    await pool.end();
  };

  return { app, server, pool, adminKey: rawAdminKey, cleanup };
}

const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip('Live game flow (E2E)', () => {
  let app: Application;
  let server: http.Server;
  let adminKey: string;
  let cleanup: () => Promise<void>;
  let serverAddress: string;

  beforeAll(async () => {
    const result = await createE2EApp();
    app = result.app;
    server = result.server;
    adminKey = result.adminKey;
    cleanup = result.cleanup;

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        serverAddress = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  });

  it('should complete a full live game flow with WebSocket fan', async () => {
    // 1. Create two teams
    const homeTeamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ name: 'E2E Home Team', abbreviation: 'EHT' });
    expect(homeTeamRes.status).toBe(201);
    const homeTeamId = homeTeamRes.body.data.team.id as string;

    const awayTeamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ name: 'E2E Away Team', abbreviation: 'EAT' });
    expect(awayTeamRes.status).toBe(201);
    const awayTeamId = awayTeamRes.body.data.team.id as string;

    // 2. Create a game
    const gameRes = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({
        homeTeamId,
        awayTeamId,
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    expect(gameRes.status).toBe(201);
    const gameId = gameRes.body.data.game.id as string;

    // 3. Generate a game-scoped coach key
    const coachKeyRes = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ label: 'Coach Key', gameId });
    expect(coachKeyRes.status).toBe(201);
    const coachKey = coachKeyRes.body.data.apiKey.rawKey as string;

    // 4. Connect WebSocket fan client
    const wsUrl = serverAddress.replace('http', 'ws') + `/ws/games/${gameId}`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Wait for initial game_state message
    const gameStateMsg = await waitForWsMessage(ws, (m) => m.type === 'game_state');
    expect(gameStateMsg.type).toBe('game_state');

    // 5. Transition game to active
    const activeRes = await request(app)
      .patch(`/api/v1/games/${gameId}/status`)
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ status: 'active' });
    expect(activeRes.status).toBe(200);

    // 6. Submit a basket event (coach key)
    const eventRes = await request(app)
      .post(`/api/v1/games/${gameId}/events`)
      .set('Authorization', `Bearer ${coachKey}`)
      .send({
        eventType: 'basket',
        scoreDelta: 2,
        teamId: homeTeamId,
        description: 'Layup by #10',
        period: 1,
        clock: '09:30',
      });
    expect(eventRes.status).toBe(201);

    // 7. Assert WebSocket client received event_update with updated score
    const eventUpdateMsg = await waitForWsMessage(ws, (m) => m.type === 'event_update', 8000);
    expect(eventUpdateMsg.type).toBe('event_update');

    const payload = eventUpdateMsg.payload as {
      gameState: { homeScore: number; awayScore: number };
    };
    expect(payload.gameState.homeScore).toBe(2);
    expect(payload.gameState.awayScore).toBe(0);

    // 8. Transition game to final
    const finalRes = await request(app)
      .patch(`/api/v1/games/${gameId}/status`)
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ status: 'final' });
    expect(finalRes.status).toBe(200);

    // 9. Assert WebSocket client received status_change
    const statusChangeMsg = await waitForWsMessage(
      ws,
      (m) => m.type === 'status_change',
      8000,
    );
    expect(statusChangeMsg.type).toBe('status_change');

    const statusPayload = statusChangeMsg.payload as { status: string };
    expect(statusPayload.status).toBe('final');

    // Cleanup WebSocket
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      if (ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      } else {
        resolve();
      }
    });
  }, 30_000);
});
