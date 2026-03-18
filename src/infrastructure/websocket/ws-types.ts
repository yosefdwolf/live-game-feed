export interface WsMessage {
  type: 'game_state' | 'event_update' | 'status_change' | 'ping' | 'error';
  payload: unknown;
  timestamp: string;
}

export interface GameStatePayload {
  game: {
    id: string;
    homeScore: number;
    awayScore: number;
    period: number;
    clock: string;
    status: string;
  };
  recentEvents: unknown[];
}
