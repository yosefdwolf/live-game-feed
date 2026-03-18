import { Request, Response, NextFunction } from 'express';
import { PlayersService } from '../domains/players/players.service';
import { CreatePlayerInput } from '../domains/players/players.types';
import { successResponse } from '../shared/response/api-response';

export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { teamId } = req.params;
      const players = await this.playersService.listPlayers(teamId);
      res.json(successResponse({ players, count: players.length }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { teamId } = req.params;
      const input = req.body as CreatePlayerInput;
      const player = await this.playersService.addPlayer(teamId, input);
      res.status(201).json(successResponse({ player }, req.requestId));
    } catch (err) {
      next(err);
    }
  };
}
