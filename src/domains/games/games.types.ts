export type GameStatus = 'scheduled' | 'active' | 'final' | 'cancelled';

/**
 * Live game state managed by the coach and broadcast to all clients via WebSocket.
 * The clock is represented as an anchor rather than a live value:
 *   - clockLastStartedAt: epoch-ms when the clock was last started
 *   - clockSecondsRemaining: seconds on the clock when it was last started/paused
 * Clients compute current time as: clockSecondsRemaining - floor((now - clockLastStartedAt) / 1000)
 * This avoids server-side ticks — only start/pause events hit the server.
 */
export interface GameState {
  period?: number;
  clockRunning?: boolean;
  clockSecondsRemaining?: number;
  clockLastStartedAt?: number; // epoch ms
  shotClockSeconds?: number;
  homeFouls?: number;
  awayFouls?: number;
  homeTimeouts?: number;
  awayTimeouts?: number;
}

export interface GameStateSnapshot {
  state: GameState;
  status: string;
  homeScore: number;
  awayScore: number;
}

export interface Game {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  sport: string;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  period: number;
  clock: string;
  scheduledAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateGameInput {
  homeTeamId: string;
  awayTeamId: string;
  sport?: string;
  scheduledAt: string; // ISO string from request
}

export interface UpdateScoreInput {
  homeScore: number;
  awayScore: number;
}

export type StatusTransition = 'active' | 'final' | 'cancelled';

/**
 * Defines the valid status state machine transitions.
 * Any transition not listed here is invalid and must be rejected.
 */
export const VALID_TRANSITIONS: Record<string, StatusTransition[]> = {
  scheduled: ['active', 'cancelled'],
  active: ['final', 'cancelled'],
  final: [],
  cancelled: [],
};
