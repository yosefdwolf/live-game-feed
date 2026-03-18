import { Router } from 'express';
import { z } from 'zod';
import { PlayersController } from '../controllers/players.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const CreatePlayerSchema = z.object({
  name: z.string().min(1).max(100),
  jerseyNumber: z.number().int().min(0).max(99),
  position: z.string().min(1).max(50).optional(),
});

export function createPlayersRouter(playersController: PlayersController): Router {
  const router = Router({ mergeParams: true });

  router.get('/', playersController.list);

  router.post(
    '/',
    requireAuth({ adminOnly: true }),
    validate(CreatePlayerSchema),
    playersController.add,
  );

  return router;
}
