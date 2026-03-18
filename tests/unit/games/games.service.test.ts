import { GamesService } from '../../../src/domains/games/games.service';
import { GamesRepository } from '../../../src/domains/games/games.repository';
import { GamesCacheRepository } from '../../../src/domains/games/games.cache-repository';
import { TeamsRepository } from '../../../src/domains/teams/teams.repository';
import { NotFoundError, ValidationError } from '../../../src/shared/errors/app-errors';
import { buildGame } from '../../helpers/factories/game.factory';
import { buildTeam } from '../../helpers/factories/team.factory';

function buildMocks() {
  const gamesRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    updateScore: jest.fn(),
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

  const teamsRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<TeamsRepository>;

  const service = new GamesService(gamesRepository, gamesCacheRepository, teamsRepository);
  return { gamesRepository, gamesCacheRepository, teamsRepository, service };
}

describe('GamesService', () => {
  describe('getGame', () => {
    it('should return game from cache when cache hit', async () => {
      const { gamesRepository, gamesCacheRepository, service } = buildMocks();
      const cachedGame = buildGame({ id: 'game-001', status: 'active' });
      gamesCacheRepository.getGameState.mockResolvedValue(cachedGame);

      const result = await service.getGame('game-001');

      expect(result).toEqual(cachedGame);
      expect(gamesRepository.findById).not.toHaveBeenCalled();
    });

    it('should fall back to postgres and warm cache when cache miss', async () => {
      const { gamesRepository, gamesCacheRepository, service } = buildMocks();
      const dbGame = buildGame({ id: 'game-002' });
      gamesCacheRepository.getGameState.mockResolvedValue(null);
      gamesRepository.findById.mockResolvedValue(dbGame);

      const result = await service.getGame('game-002');

      expect(result).toEqual(dbGame);
      expect(gamesRepository.findById).toHaveBeenCalledWith('game-002');
      expect(gamesCacheRepository.setGameState).toHaveBeenCalledWith(dbGame);
    });

    it('should throw NotFoundError when game does not exist', async () => {
      const { gamesRepository, gamesCacheRepository, service } = buildMocks();
      gamesCacheRepository.getGameState.mockResolvedValue(null);
      gamesRepository.findById.mockResolvedValue(null);

      await expect(service.getGame('nonexistent-id')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('createGame', () => {
    it('should validate both teams exist when creating game', async () => {
      const { gamesRepository, teamsRepository, service } = buildMocks();
      teamsRepository.findById.mockResolvedValue(null); // Both teams not found

      await expect(
        service.createGame({
          homeTeamId: 'home-team-id',
          awayTeamId: 'away-team-id',
          scheduledAt: '2025-12-01T19:00:00Z',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(gamesRepository.create).not.toHaveBeenCalled();
    });

    it('should create game and warm cache when both teams exist', async () => {
      const { gamesRepository, gamesCacheRepository, teamsRepository, service } = buildMocks();
      const homeTeam = buildTeam({ id: 'home-team-id' });
      const awayTeam = buildTeam({ id: 'away-team-id' });
      const newGame = buildGame({ id: 'new-game-id' });

      teamsRepository.findById
        .mockResolvedValueOnce(homeTeam)
        .mockResolvedValueOnce(awayTeam);
      gamesRepository.create.mockResolvedValue(newGame);

      const result = await service.createGame({
        homeTeamId: 'home-team-id',
        awayTeamId: 'away-team-id',
        scheduledAt: '2025-12-01T19:00:00Z',
      });

      expect(result).toEqual(newGame);
      expect(gamesCacheRepository.setGameState).toHaveBeenCalledWith(newGame);
    });

    it('should throw NotFoundError when away team does not exist', async () => {
      const { gamesRepository, teamsRepository, service } = buildMocks();
      const homeTeam = buildTeam({ id: 'home-team-id' });

      teamsRepository.findById
        .mockResolvedValueOnce(homeTeam)
        .mockResolvedValueOnce(null); // Away team not found

      await expect(
        service.createGame({
          homeTeamId: 'home-team-id',
          awayTeamId: 'missing-away-id',
          scheduledAt: '2025-12-01T19:00:00Z',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(gamesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('transitionStatus', () => {
    it('should throw NotFoundError when game does not exist', async () => {
      const { gamesRepository, service } = buildMocks();
      gamesRepository.findById.mockResolvedValue(null);

      await expect(service.transitionStatus('nonexistent', 'active')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('should throw ValidationError when transition is invalid', async () => {
      const { gamesRepository, service } = buildMocks();
      const finalGame = buildGame({ status: 'final' });
      gamesRepository.findById.mockResolvedValue(finalGame);

      // Cannot transition from final to active
      await expect(service.transitionStatus(finalGame.id, 'active')).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('should update status and cache on valid transition', async () => {
      const { gamesRepository, gamesCacheRepository, service } = buildMocks();
      const scheduledGame = buildGame({ status: 'scheduled' });
      const activeGame = buildGame({ ...scheduledGame, status: 'active', startedAt: new Date() });

      gamesRepository.findById.mockResolvedValue(scheduledGame);
      gamesRepository.updateStatus.mockResolvedValue(activeGame);

      const result = await service.transitionStatus(scheduledGame.id, 'active');

      expect(result).toEqual(activeGame);
      expect(gamesCacheRepository.setGameState).toHaveBeenCalledWith(activeGame);
    });

    it('should set startedAt when transitioning to active', async () => {
      const { gamesRepository, service } = buildMocks();
      const scheduledGame = buildGame({ status: 'scheduled' });
      const activeGame = buildGame({ status: 'active' });
      gamesRepository.findById.mockResolvedValue(scheduledGame);
      gamesRepository.updateStatus.mockResolvedValue(activeGame);

      await service.transitionStatus(scheduledGame.id, 'active');

      const [, , extras] = gamesRepository.updateStatus.mock.calls[0];
      expect(extras?.startedAt).toBeInstanceOf(Date);
    });

    it('should set endedAt when transitioning to final', async () => {
      const { gamesRepository, service } = buildMocks();
      const activeGame = buildGame({ status: 'active' });
      const finalGame = buildGame({ status: 'final' });
      gamesRepository.findById.mockResolvedValue(activeGame);
      gamesRepository.updateStatus.mockResolvedValue(finalGame);

      await service.transitionStatus(activeGame.id, 'final');

      const [, , extras] = gamesRepository.updateStatus.mock.calls[0];
      expect(extras?.endedAt).toBeInstanceOf(Date);
    });
  });
});
