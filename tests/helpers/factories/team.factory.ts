import { Team } from '../../../src/domains/teams/teams.types';

let counter = 0;

/**
 * Builds a Team object with sensible defaults.
 * Used in unit tests to avoid hardcoded fixture data.
 */
export function buildTeam(overrides: Partial<Team> = {}): Team {
  counter += 1;
  const now = new Date('2025-01-01T00:00:00.000Z');
  return {
    id: `team-uuid-${counter.toString().padStart(4, '0')}`,
    name: `Test Team ${counter}`,
    abbreviation: `T${counter}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
