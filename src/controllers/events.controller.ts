import { Request, Response, NextFunction } from 'express';
import { EventsService } from '../domains/events/events.service';
import { CreateEventInput } from '../domains/events/events.types';
import { successResponse } from '../shared/response/api-response';
import { AuthContext } from '../types/express';

export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const input = req.body as CreateEventInput;
      const authContext = req.authContext as AuthContext;

      const event = await this.eventsService.submitEvent(gameId, authContext, input);
      res.status(201).json(successResponse({ event }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const cursor = req.query.cursor as string | undefined;

      const { events, nextCursor } = await this.eventsService.listEvents(gameId, limit, cursor);
      res.json(successResponse({ events, nextCursor, count: events.length }, req.requestId));
    } catch (err) {
      next(err);
    }
  };
}
