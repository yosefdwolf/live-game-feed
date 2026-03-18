import { GameEvent } from '../../../src/domains/events/events.types';

let counter = 0;

/**
 * Builds a GameEvent object with sensible defaults.
 * Used in unit tests to avoid hardcoded fixture data.
 */
export function buildEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  counter += 1;
  const now = new Date('2025-01-01T00:00:00.000Z');
  return {
    id: `event-uuid-${counter.toString().padStart(4, '0')}`,
    gameId: `game-uuid-${counter.toString().padStart(4, '0')}`,
    teamId: null,
    playerId: null,
    eventType: 'basket',
    scoreDelta: 2,
    description: null,
    period: 1,
    clock: '09:30',
    metadata: null,
    createdAt: now,
    ...overrides,
  };
}
