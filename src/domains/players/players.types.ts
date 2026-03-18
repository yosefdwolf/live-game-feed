export interface Player {
  id: string;
  teamId: string;
  name: string;
  jerseyNumber: number;
  position: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreatePlayerInput {
  name: string;
  jerseyNumber: number;
  position?: string;
}
