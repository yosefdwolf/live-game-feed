export type GameStatus = 'scheduled' | 'active' | 'final' | 'cancelled';

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
