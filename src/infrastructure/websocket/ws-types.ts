import { GameState } from '../../domains/games/games.types';

export interface WsMessage {
  type: 'game_state' | 'event_update' | 'state_update' | 'status_change' | 'ping' | 'error';
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
    state: GameState;
  };
  recentEvents: unknown[];
}
