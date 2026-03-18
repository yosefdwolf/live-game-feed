import { PoolClient } from 'pg';
import { EventsService } from '../../../src/domains/events/events.service';
import { EventsRepository } from '../../../src/domains/events/events.repository';
import { GamesRepository } from '../../../src/domains/games/games.repository';
import { GamesCacheRepository } from '../../../src/domains/games/games.cache-repository';
import { EventPublisher } from '../../../src/domains/events/events.publisher';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../src/shared/errors/app-errors';
import { buildGame } from '../../helpers/factories/game.factory';
import { buildEvent } from '../../helpers/factories/event.factory';
import { AuthContext } from '../../../src/types/express';

function buildAdminContext(): AuthContext {
  return { keyId: 'admin-key-id', gameId: null, isAdmin: true };
}

function buildCoachContext(gameId: string): AuthContext {
  return { keyId: 'coach-key-id', gameId, isAdmin: false };
}

function buildMocks() {
  const mockClient = {} as PoolClient;

  const eventsRepository = {
    create: jest.fn(),
    findByGame: jest.fn(),
    buildCursor: jest.fn(),
  } as unknown as jest.Mocked<EventsRepository>;

  const gamesRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    updateScore: jest.fn().mockResolvedValue(undefined),
    buildCursor: jest.fn(),
  } as unknown as jest.Mocked<GamesRepository>;

  const gamesCacheRepository = {
    getGameState: jest.fn(),
    setGameState: jest.fn().mockResolvedValue(undefined),
    invalidateGameState: jest.fn().mockResolvedValue(undefined),
    pushRecentEvent: jest.fn().mockResolvedValue(undefined),
    getRecentEvents: jest.fn(),
    incrementFanCount: jest.fn().mockResolvedValue(undefined),
    decrementFanCount: jest.fn().mockResolvedValue(undefined),
    getFanCount: jest.fn(),
    evictGame: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GamesCacheRepository>;

  const eventPublisher = {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<EventPublisher>;

  // Mock withTransaction to execute fn immediately with the mock client
  const withTransaction = jest.fn().mockImplementation(
    async (fn: (client: PoolClient) => Promise<unknown>) => fn(mockClient),
  );

  const service = new EventsService(
    eventsRepository,
    gamesRepository,
    gamesCacheRepository,
    eventPublisher,
    withTransaction,
  );

  return {
    eventsRepository,
    gamesRepository,
    gamesCacheRepository,
    eventPublisher,
    withTransaction,
    service,
    mockClient,
  };
}

describe('EventsService', () => {
  describe('submitEvent', () => {
    it('should throw NotFoundError when game does not exist', async () => {
      const { gamesRepository, service } = buildMocks();
      gamesRepository.findById.mockResolvedValue(null);

      await expect(
        service.submitEvent('nonexistent-game', buildAdminContext(), { eventType: 'basket' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should throw ValidationError when game is not active', async () => {
      const { gamesRepository, service } = buildMocks();
      const scheduledGame = buildGame({ status: 'scheduled' });
      gamesRepository.findById.mockResolvedValue(scheduledGame);

      await expect(
        service.submitEvent(scheduledGame.id, buildAdminContext(), { eventType: 'basket' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should throw ForbiddenError when game-scoped key submits to wrong game', async () => {
      const { gamesRepository, service } = buildMocks();
      const game = buildGame({ id: 'game-111', status: 'active' });
      gamesRepository.findById.mockResolvedValue(game);

      const wrongGameContext = buildCoachContext('game-999'); // Different game

      await expect(
        service.submitEvent('game-111', wrongGameContext, { eventType: 'basket' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('should commit event and update score in transaction', async () => {
      const { gamesRepository, eventsRepository, service, mockClient } = buildMocks();
      const game = buildGame({
        id: 'game-active',
        status: 'active',
        homeScore: 10,
        awayScore: 8,
        homeTeamId: 'home-team',
        awayTeamId: 'away-team',
      });
      const newEvent = buildEvent({ gameId: game.id, scoreDelta: 2 });
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.create.mockResolvedValue(newEvent);

      const result = await service.submitEvent(
        game.id,
        buildAdminContext(),
        { eventType: 'basket', scoreDelta: 2, teamId: 'home-team' },
      );

      expect(result).toEqual(newEvent);
      expect(eventsRepository.create).toHaveBeenCalledWith(mockClient, game.id, expect.objectContaining({
        eventType: 'basket',
        scoreDelta: 2,
      }));
      expect(gamesRepository.updateScore).toHaveBeenCalledWith(
        mockClient,
        game.id,
        { homeScore: 12, awayScore: 8 },
      );
    });

    it('should publish event to Redis after transaction commits', async () => {
      const { gamesRepository, eventsRepository, eventPublisher, service } = buildMocks();
      const game = buildGame({ id: 'game-pub', status: 'active' });
      const newEvent = buildEvent({ gameId: game.id });
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.create.mockResolvedValue(newEvent);

      await service.submitEvent(game.id, buildAdminContext(), { eventType: 'foul' });

      // Allow fire-and-forget promises to settle
      await new Promise((resolve) => setImmediate(resolve));

      expect(eventPublisher.publish).toHaveBeenCalledWith(
        game.id,
        expect.objectContaining({ type: 'event_update' }),
      );
    });

    it('should not rollback if cache update fails after commit', async () => {
      const { gamesRepository, eventsRepository, gamesCacheRepository, service } = buildMocks();
      const game = buildGame({ id: 'game-cache-fail', status: 'active' });
      const newEvent = buildEvent({ gameId: game.id });
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.create.mockResolvedValue(newEvent);

      // Cache update will fail
      gamesCacheRepository.setGameState.mockRejectedValue(new Error('Redis unavailable'));

      // Should still resolve without throwing — cache failure is non-fatal
      await expect(
        service.submitEvent(game.id, buildAdminContext(), { eventType: 'timeout' }),
      ).resolves.toEqual(newEvent);
    });

    it('should allow admin key to submit to any game', async () => {
      const { gamesRepository, eventsRepository, service } = buildMocks();
      const game = buildGame({ id: 'game-admin', status: 'active' });
      const newEvent = buildEvent({ gameId: game.id });
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.create.mockResolvedValue(newEvent);

      const result = await service.submitEvent(game.id, buildAdminContext(), {
        eventType: 'basket',
      });

      expect(result).toEqual(newEvent);
    });

    it('should allow game-scoped key to submit to its own game', async () => {
      const { gamesRepository, eventsRepository, service } = buildMocks();
      const game = buildGame({ id: 'game-scoped', status: 'active' });
      const newEvent = buildEvent({ gameId: game.id });
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.create.mockResolvedValue(newEvent);

      const result = await service.submitEvent(game.id, buildCoachContext(game.id), {
        eventType: 'basket',
      });

      expect(result).toEqual(newEvent);
    });
  });

  describe('listEvents', () => {
    it('should throw NotFoundError when game does not exist', async () => {
      const { gamesRepository, service } = buildMocks();
      gamesRepository.findById.mockResolvedValue(null);

      await expect(service.listEvents('nonexistent', 50)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should return paginated events', async () => {
      const { gamesRepository, eventsRepository, service } = buildMocks();
      const game = buildGame({ id: 'game-list' });
      const events = [buildEvent({ gameId: game.id }), buildEvent({ gameId: game.id })];
      gamesRepository.findById.mockResolvedValue(game);
      eventsRepository.findByGame.mockResolvedValue(events);

      const result = await service.listEvents(game.id, 50);

      expect(result.events).toEqual(events);
      expect(result.nextCursor).toBeNull();
    });
  });
});
