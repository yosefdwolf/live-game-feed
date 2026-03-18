import { Router } from 'express';
import { z } from 'zod';
import { TeamsController } from '../controllers/teams.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  abbreviation: z.string().min(1).max(10),
});

export function createTeamsRouter(teamsController: TeamsController): Router {
  const router = Router();

  router.get('/', teamsController.list);

  router.post(
    '/',
    requireAuth({ adminOnly: true }),
    validate(CreateTeamSchema),
    teamsController.create,
  );

  return router;
}
