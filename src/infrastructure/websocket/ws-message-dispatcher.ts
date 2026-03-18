import WebSocket from 'ws';
import { WsConnectionRegistry } from './ws-connection-registry';
import { WsMessage } from './ws-types';

/**
 * Dispatches WsMessages to all open connections registered for a game.
 * Each send is isolated — one failing client does not affect others.
 */
export class WsMessageDispatcher {
  constructor(private readonly registry: WsConnectionRegistry) {}

  /**
   * Sends a message to every open WebSocket in the game's connection set.
   * Skips connections that are not in OPEN state.
   * Per-client send errors are caught and logged without aborting the broadcast.
   */
  dispatch(gameId: string, message: WsMessage): void {
    const serialized = JSON.stringify(message);
    const connections = this.registry.getConnections(gameId);

    for (const ws of connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(serialized);
      } catch (err) {
        const error = err as Error;
        console.error('Failed to send WebSocket message to client', {
          gameId,
          error: error.message,
        });
      }
    }
  }
}
