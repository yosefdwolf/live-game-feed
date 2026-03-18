import WebSocket from 'ws';

/**
 * Tracks all active WebSocket connections per game.
 * Each game maps to a Set of WebSocket instances.
 * Cleanup on disconnect prevents memory leaks — always call unregister.
 */
export class WsConnectionRegistry {
  private readonly connections = new Map<string, Set<WebSocket>>();

  /**
   * Registers a WebSocket connection under a game id.
   * Creates the Set on first registration for the game.
   */
  register(gameId: string, ws: WebSocket): void {
    if (!this.connections.has(gameId)) {
      this.connections.set(gameId, new Set());
    }
    this.connections.get(gameId)!.add(ws);
  }

  /**
   * Removes a WebSocket from a game's connection set.
   * Cleans up the Set entirely if no connections remain.
   */
  unregister(gameId: string, ws: WebSocket): void {
    const set = this.connections.get(gameId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.connections.delete(gameId);
    }
  }

  /**
   * Returns the set of connections for a game, or an empty Set if none exist.
   */
  getConnections(gameId: string): Set<WebSocket> {
    return this.connections.get(gameId) ?? new Set();
  }

  /**
   * Returns the number of active connections for a game.
   */
  getGameCount(gameId: string): number {
    return this.connections.get(gameId)?.size ?? 0;
  }
}
