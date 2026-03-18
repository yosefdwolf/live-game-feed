import { Request, Response, NextFunction } from 'express';
import { GamesService } from '../domains/games/games.service';
import { CreateGameInput, GameState, StatusTransition } from '../domains/games/games.types';
import { successResponse } from '../shared/response/api-response';

export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const cursor = req.query.cursor as string | undefined;

      const { games, nextCursor } = await this.gamesService.listGames(status, limit, cursor);

      res.json(
        successResponse({ games, nextCursor, count: games.length }, req.requestId),
      );
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await this.gamesService.getGame(req.params.gameId);
      res.json(successResponse({ game }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as CreateGameInput;
      const game = await this.gamesService.createGame(input);
      res.status(201).json(successResponse({ game }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  transitionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const { status } = req.body as { status: StatusTransition };

      const game = await this.gamesService.transitionStatus(gameId, status);
      res.json(successResponse({ game }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  updateState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const patch = req.body as GameState;
      const state = await this.gamesService.updateGameState(gameId, patch);
      res.json(successResponse({ state }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  getState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const snapshot = await this.gamesService.getGameSnapshot(gameId);
      res.json(successResponse(snapshot, req.requestId));
    } catch (err) {
      next(err);
    }
  };
}
