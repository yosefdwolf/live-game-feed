import { Request, Response, NextFunction } from 'express';
import { TeamsService } from '../domains/teams/teams.service';
import { CreateTeamInput } from '../domains/teams/teams.types';
import { successResponse } from '../shared/response/api-response';

export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teams = await this.teamsService.listTeams();
      res.json(successResponse({ teams, count: teams.length }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as CreateTeamInput;
      const team = await this.teamsService.createTeam(input);
      res.status(201).json(successResponse({ team }, req.requestId));
    } catch (err) {
      next(err);
    }
  };
}
