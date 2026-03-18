import { Router } from 'express';
import { z } from 'zod';
import { EventsController } from '../controllers/events.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { eventSubmitRateLimit } from '../middleware/rate-limit.middleware';

const EVENT_TYPES = [
  'basket',
  'three_pointer',
  'free_throw',
  'foul',
  'timeout',
  'period_end',
  'game_start',
  'game_end',
  'correction',
  'substitution',
  'turnover',
] as const;

const CreateEventSchema = z.object({
  teamId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  eventType: z.enum(EVENT_TYPES),
  scoreDelta: z.number().int().optional().default(0),
  description: z.string().max(500).optional(),
  period: z.number().int().min(1).optional(),
  clock: z.string().max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export function createEventsRouter(eventsController: EventsController): Router {
  const router = Router({ mergeParams: true });

  // Coach submits an event — requires auth, rate-limited
  router.post(
    '/',
    requireAuth(),
    eventSubmitRateLimit,
    validate(CreateEventSchema),
    eventsController.submit,
  );

  // Public — fans can read event history
  router.get('/', eventsController.list);

  return router;
}
