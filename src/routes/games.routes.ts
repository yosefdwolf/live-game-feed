import { Router } from 'express';
import { z } from 'zod';
import { GamesController } from '../controllers/games.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const CreateGameSchema = z.object({
  homeTeamId: z.string().uuid('homeTeamId must be a valid UUID'),
  awayTeamId: z.string().uuid('awayTeamId must be a valid UUID'),
  sport: z.string().min(1).max(50).optional(),
  scheduledAt: z.string().datetime('scheduledAt must be a valid ISO 8601 datetime'),
});

const TransitionStatusSchema = z.object({
  status: z.enum(['active', 'final', 'cancelled']),
});

const UpdateGameStateSchema = z.object({
  period: z.number().int().min(1).max(10).optional(),
  clockRunning: z.boolean().optional(),
  clockSecondsRemaining: z.number().int().min(0).optional(),
  clockLastStartedAt: z.number().int().min(0).optional(),
  shotClockSeconds: z.number().int().min(0).max(30).optional(),
  homeFouls: z.number().int().min(0).optional(),
  awayFouls: z.number().int().min(0).optional(),
  homeTimeouts: z.number().int().min(0).optional(),
  awayTimeouts: z.number().int().min(0).optional(),
});

export function createGamesRouter(gamesController: GamesController): Router {
  const router = Router();

  // Public — fans can list and read games without a key
  router.get('/', gamesController.list);
  router.get('/:gameId', gamesController.get);

  // Admin only — only admin keys can create games
  router.post(
    '/',
    requireAuth({ adminOnly: true }),
    validate(CreateGameSchema),
    gamesController.create,
  );

  // Any valid key can transition status (coaches use game-scoped keys)
  router.patch(
    '/:gameId/status',
    requireAuth(),
    validate(TransitionStatusSchema),
    gamesController.transitionStatus,
  );

  // Public — fans fetch the current live state snapshot on connect
  router.get('/:gameId/state', gamesController.getState);

  // Any valid key can push state updates (coaches use game-scoped keys)
  router.patch(
    '/:gameId/state',
    requireAuth(),
    validate(UpdateGameStateSchema),
    gamesController.updateState,
  );

  return router;
}
