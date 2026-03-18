import { PlayersRepository } from './players.repository';
import { TeamsRepository } from '../teams/teams.repository';
import { Player, CreatePlayerInput } from './players.types';
import { NotFoundError } from '../../shared/errors/app-errors';

export class PlayersService {
  constructor(
    private readonly playersRepository: PlayersRepository,
    private readonly teamsRepository: TeamsRepository,
  ) {}

  /**
   * Lists all active players on a team.
   * Verifies the team exists first to give a meaningful error.
   */
  async listPlayers(teamId: string): Promise<Player[]> {
    const team = await this.teamsRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError(`Team with id '${teamId}' was not found`);
    }
    return this.playersRepository.findByTeam(teamId);
  }

  /**
   * Adds a player to a team.
   * Verifies the team exists before attempting insertion.
   */
  async addPlayer(teamId: string, input: CreatePlayerInput): Promise<Player> {
    const team = await this.teamsRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError(`Team with id '${teamId}' was not found`);
    }
    return this.playersRepository.create(teamId, input);
  }
}
