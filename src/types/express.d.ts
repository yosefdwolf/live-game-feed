export interface AuthContext {
  keyId: string;
  gameId: string | null; // null = admin key with unrestricted access
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      authContext?: AuthContext;
    }
  }
}
