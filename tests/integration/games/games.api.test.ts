/**
 * Integration tests for the Games API.
 * These tests run against a real PostgreSQL database and a real Redis instance.
 *
 * Prerequisites:
 * - DATABASE_URL pointing at a test database
 * - REDIS_URL pointing at a test Redis instance
 * - Migrations already applied to the test DB
 *
 * Set TEST_DATABASE_URL and TEST_REDIS_URL in your environment, or use docker-compose.
 */

import request from 'supertest';
import { Pool } from 'pg';
import { Application } from 'express';
import crypto from 'crypto';

// Skip integration tests if no database URL configured
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
const SKIP = !TEST_DATABASE_URL || !TEST_REDIS_URL;

/**
 * Creates an isolated app instance with its own pool/redis for testing.
 * Avoids importing config (which calls process.exit on missing env vars).
 */
async function createTestApp(): Promise<{
  app: Application;
  pool: Pool;
  adminKey: string;
  cleanup: () => Promise<void>;
}> {
  // Dynamic imports so env is set before modules load
  const { Pool: PgPool } = await import('pg');
  const Redis = (await import('ioredis')).default;

  const pool = new PgPool({ connectionString: TEST_DATABASE_URL });
  const redisClient = new Redis(TEST_REDIS_URL!);
  const redisSubscriber = new Redis(TEST_REDIS_URL!);

  // Truncate tables before each test suite
  await pool.query(`
    TRUNCATE events, api_keys, games, players, teams RESTART IDENTITY CASCADE
  `);
  await redisClient.flushdb();

  // Insert 2 teams for game creation tests
  const homeTeamRes = await pool.query<{ id: string }>(
    `INSERT INTO teams (name, abbreviation) VALUES ('Home Squad', 'HSQ') RETURNING id`,
  );
  const awayTeamRes = await pool.query<{ id: string }>(
    `INSERT INTO teams (name, abbreviation) VALUES ('Away Squad', 'ASQ') RETURNING id`,
  );
  const homeTeamId = homeTeamRes.rows[0].id;
  const awayTeamId = awayTeamRes.rows[0].id;

  // Create an admin API key
  const rawAdminKey = `lgf_v1_${crypto.randomBytes(32).toString('hex')}`;
  const adminKeyHash = crypto.createHash('sha256').update(rawAdminKey).digest('hex');
  await pool.query(
    `INSERT INTO api_keys (key_hash, label, game_id) VALUES ($1, 'Test Admin Key', NULL)`,
    [adminKeyHash],
  );

  // Build the app wiring
  const { withTransaction } = await import('../../../src/config/database');
  const { AuthRepository } = await import('../../../src/domains/auth/auth.repository');
  const { AuthCacheRepository } = await import('../../../src/domains/auth/auth.cache-repository');
  const { TeamsRepository } = await import('../../../src/domains/teams/teams.repository');
  const { PlayersRepository } = await import('../../../src/domains/players/players.repository');
  const { GamesRepository } = await import('../../../src/domains/games/games.repository');
  const { GamesCacheRepository } = await import('../../../src/domains/games/games.cache-repository');
  const { EventsRepository } = await import('../../../src/domains/events/events.repository');
  const { EventPublisher } = await import('../../../src/domains/events/events.publisher');
  const { AuthService } = await import('../../../src/domains/auth/auth.service');
  const { TeamsService } = await import('../../../src/domains/teams/teams.service');
  const { PlayersService } = await import('../../../src/domains/players/players.service');
  const { GamesService } = await import('../../../src/domains/games/games.service');
  const { EventsService } = await import('../../../src/domains/events/events.service');
  const { GamesController } = await import('../../../src/controllers/games.controller');
  const { EventsController } = await import('../../../src/controllers/events.controller');
  const { TeamsController } = await import('../../../src/controllers/teams.controller');
  const { PlayersController } = await import('../../../src/controllers/players.controller');
  const { ApiKeysController } = await import('../../../src/controllers/api-keys.controller');
  const { createApp } = await import('../../../src/app');

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

  // Expose team IDs via app.locals for tests
  app.locals.homeTeamId = homeTeamId;
  app.locals.awayTeamId = awayTeamId;

  const cleanup = async () => {
    await redisClient.quit();
    await redisSubscriber.quit();
    await pool.end();
  };

  return { app, pool, adminKey: rawAdminKey, cleanup };
}

// Only run when database is available
const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip('Games API integration', () => {
  let app: Application;
  let pool: Pool;
  let adminKey: string;
  let cleanup: () => Promise<void>;
  let homeTeamId: string;
  let awayTeamId: string;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    pool = result.pool;
    adminKey = result.adminKey;
    cleanup = result.cleanup;
    homeTeamId = app.locals.homeTeamId as string;
    awayTeamId = app.locals.awayTeamId as string;
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v1/games', () => {
    it('should return empty list initially', async () => {
      const res = await request(app).get('/api/v1/games');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.games).toEqual([]);
    });
  });

  describe('POST /api/v1/games', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should create game with valid admin key', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          sport: 'basketball',
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.game.id).toBeDefined();
      expect(res.body.data.game.status).toBe('scheduled');
    });

    it('should return 400 for invalid scheduledAt', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: 'not-a-date',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/games/:gameId', () => {
    it('should return 404 for unknown game', async () => {
      const res = await request(app).get(
        '/api/v1/games/00000000-0000-0000-0000-000000000000',
      );

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return game by id', async () => {
      // Create a game first
      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      const gameId = createRes.body.data.game.id as string;

      const getRes = await request(app).get(`/api/v1/games/${gameId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.game.id).toBe(gameId);
    });
  });

  describe('PATCH /api/v1/games/:gameId/status', () => {
    it('should transition from scheduled to active', async () => {
      // Create a game
      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      const gameId = createRes.body.data.game.id as string;

      const patchRes = await request(app)
        .patch(`/api/v1/games/${gameId}/status`)
        .set('Authorization', `Bearer ${adminKey}`)
        .send({ status: 'active' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.game.status).toBe('active');
      expect(patchRes.body.data.game.startedAt).not.toBeNull();
    });

    it('should return 400 for invalid status transition', async () => {
      // Create a game and put it in final state
      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      const gameId = createRes.body.data.game.id as string;

      // Transition to active, then to final
      await request(app)
        .patch(`/api/v1/games/${gameId}/status`)
        .set('Authorization', `Bearer ${adminKey}`)
        .send({ status: 'active' });

      await request(app)
        .patch(`/api/v1/games/${gameId}/status`)
        .set('Authorization', `Bearer ${adminKey}`)
        .send({ status: 'final' });

      // Try invalid transition from final
      const invalidRes = await request(app)
        .patch(`/api/v1/games/${gameId}/status`)
        .set('Authorization', `Bearer ${adminKey}`)
        .send({ status: 'active' });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.success).toBe(false);
    });

    it('should return 403 with game-scoped key for a different game', async () => {
      // Create a game
      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', `Bearer ${adminKey}`)
        .send({
          homeTeamId,
          awayTeamId,
          scheduledAt: '2025-12-01T19:00:00.000Z',
        });

      const gameId = createRes.body.data.game.id as string;

      // Create a game-scoped key for a DIFFERENT game id
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO games (home_team_id, away_team_id, scheduled_at)
         VALUES ($1, $2, NOW() + interval '1 day')
         RETURNING id`,
        [homeTeamId, awayTeamId],
      );
      const otherGameId = rows[0].id;

      const rawCoachKey = `lgf_v1_${crypto.randomBytes(32).toString('hex')}`;
      const coachKeyHash = crypto.createHash('sha256').update(rawCoachKey).digest('hex');
      await pool.query(
        `INSERT INTO api_keys (key_hash, label, game_id) VALUES ($1, 'Coach Key', $2)`,
        [coachKeyHash, otherGameId],
      );

      const res = await request(app)
        .patch(`/api/v1/games/${gameId}/status`)
        .set('Authorization', `Bearer ${rawCoachKey}`)
        .send({ status: 'active' });

      expect(res.status).toBe(403);
    });
  });
});
