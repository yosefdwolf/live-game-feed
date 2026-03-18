export type EventType =
  | 'basket'
  | 'three_pointer'
  | 'free_throw'
  | 'foul'
  | 'timeout'
  | 'period_end'
  | 'game_start'
  | 'game_end'
  | 'correction'
  | 'substitution'
  | 'turnover';

export interface GameEvent {
  id: string;
  gameId: string;
  teamId: string | null;
  playerId: string | null;
  eventType: EventType;
  scoreDelta: number;
  description: string | null;
  period: number;
  clock: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateEventInput {
  teamId?: string;
  playerId?: string;
  eventType: EventType;
  scoreDelta?: number;
  description?: string;
  period?: number;
  clock?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The payload published to Redis Pub/Sub and forwarded to WebSocket fans.
 * Contains both the event and a snapshot of current game state for quick rendering.
 */
export interface EventUpdate {
  type: 'event_update';
  event: GameEvent;
  gameState: {
    homeScore: number;
    awayScore: number;
    period: number;
    clock: string;
    status: string;
  };
}
