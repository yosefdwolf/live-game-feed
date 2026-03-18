import { Game } from '../../../src/domains/games/games.types';

let counter = 0;

/**
 * Builds a Game object with sensible defaults.
 * Used in unit tests to avoid hardcoded fixture data.
 */
export function buildGame(overrides: Partial<Game> = {}): Game {
  counter += 1;
  const now = new Date('2025-01-01T00:00:00.000Z');
  const tomorrow = new Date('2025-01-02T19:00:00.000Z');
  return {
    id: `game-uuid-${counter.toString().padStart(4, '0')}`,
    homeTeamId: `home-team-uuid-${counter.toString().padStart(4, '0')}`,
    awayTeamId: `away-team-uuid-${counter.toString().padStart(4, '0')}`,
    sport: 'basketball',
    status: 'scheduled',
    homeScore: 0,
    awayScore: 0,
    period: 1,
    clock: '10:00',
    scheduledAt: tomorrow,
    startedAt: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
