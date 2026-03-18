import { TeamsRepository } from './teams.repository';
import { Team, CreateTeamInput } from './teams.types';
import { NotFoundError } from '../../shared/errors/app-errors';

export class TeamsService {
  constructor(private readonly teamsRepository: TeamsRepository) {}

  async listTeams(): Promise<Team[]> {
    return this.teamsRepository.findAll();
  }

  /**
   * Returns a team by id or throws NotFoundError.
   */
  async getTeam(id: string): Promise<Team> {
    const team = await this.teamsRepository.findById(id);
    if (!team) {
      throw new NotFoundError(`Team with id '${id}' was not found`);
    }
    return team;
  }

  async createTeam(input: CreateTeamInput): Promise<Team> {
    return this.teamsRepository.create(input);
  }
}
