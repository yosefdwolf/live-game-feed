export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateTeamInput {
  name: string;
  abbreviation: string;
}
