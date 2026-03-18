import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import Redis from 'ioredis';
import { WsConnectionRegistry } from './ws-connection-registry';
import { WsMessageDispatcher } from './ws-message-dispatcher';
import { WsMessage, GameStatePayload } from './ws-types';
import { GamesService } from '../../domains/games/games.service';
import { GamesCacheRepository } from '../../domains/games/games.cache-repository';

interface WsServerDeps {
  registry: WsConnectionRegistry;
  dispatcher: WsMessageDispatcher;
  gamesService: GamesService;
  gamesCacheRepository: GamesCacheRepository;
  redisSubscriber: Redis;
}

const GAME_PATH_PATTERN = /^\/ws\/games\/([0-9a-f-]{36})$/i;
const PING_INTERVAL_MS = 30_000;

/**
 * Attaches a WebSocket server to an existing HTTP server.
 *
 * Connection flow:
 * 1. Parse gameId from URL (/ws/games/:gameId)
 * 2. Send catch-up game_state message (current score + recent events)
 * 3. Register connection and increment Redis fan count
 * 4. Subscribe redisSubscriber to game channel (once per channel)
 * 5. Dispatch Redis Pub/Sub messages to all connections for the game
 * 6. 30s ping interval keeps connections alive through proxies/load balancers
 * 7. On close: unregister + decrement fan count
 */
export function createWsServer(server: http.Server, deps: WsServerDeps): WebSocketServer {
  const { registry, dispatcher, gamesService, gamesCacheRepository, redisSubscriber } = deps;

  const wss = new WebSocketServer({ server, path: undefined });

  // Track which game channels we've already subscribed to
  const subscribedChannels = new Set<string>();

  // Ping all open connections every 30 seconds
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        const ping: WsMessage = {
          type: 'ping',
          payload: null,
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(ping));
      }
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Forward Redis Pub/Sub messages to WebSocket clients.
  // Each message published to the channel carries a `type` field that maps
  // directly to the WsMessage type — event_update, state_update, status_change.
  redisSubscriber.on('message', (channel: string, message: string) => {
    // channel format: lgf:v1:game:{gameId}:events
    const parts = channel.split(':');
    const gameId = parts[3];
    if (!gameId) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      console.error('Failed to parse Redis Pub/Sub message', { channel });
      return;
    }

    // Use the type embedded in the Redis message; default to event_update for
    // backwards compatibility with any messages that predate this field.
    const msgType = (parsed.type as WsMessage['type']) ?? 'event_update';

    const wsMessage: WsMessage = {
      type: msgType,
      payload: parsed,
      timestamp: new Date().toISOString(),
    };

    dispatcher.dispatch(gameId, wsMessage);
  });

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    // 1. Parse gameId from request URL
    const rawUrl = req.url ?? '';
    const match = GAME_PATH_PATTERN.exec(rawUrl);

    if (!match) {
      ws.close(1008, 'Invalid URL. Expected /ws/games/:gameId');
      return;
    }

    const gameId = match[1];

    // 2. Send catch-up game_state message
    try {
      const [game, snapshot, recentEvents] = await Promise.all([
        gamesService.getGame(gameId),
        gamesService.getGameSnapshot(gameId),
        gamesCacheRepository.getRecentEvents(gameId),
      ]);

      const catchUpPayload: GameStatePayload = {
        game: {
          id: game.id,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          period: game.period,
          clock: game.clock,
          status: game.status,
          state: snapshot.state,
        },
        recentEvents,
      };

      const catchUpMessage: WsMessage = {
        type: 'game_state',
        payload: catchUpPayload,
        timestamp: new Date().toISOString(),
      };

      ws.send(JSON.stringify(catchUpMessage));

      // If game is already final or cancelled, inform the client and close
      if (game.status === 'final' || game.status === 'cancelled') {
        const statusMsg: WsMessage = {
          type: 'status_change',
          payload: { status: game.status },
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(statusMsg));
        setTimeout(() => ws.close(1000, 'Game has ended'), 5000);
        return;
      }
    } catch (err) {
      const error = err as Error;
      console.error('Failed to send game_state catch-up', { gameId, error: error.message });
      const errMsg: WsMessage = {
        type: 'error',
        payload: { message: 'Game not found' },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(errMsg));
      ws.close(1008, 'Game not found');
      return;
    }

    // 3. Register connection and track fan count
    registry.register(gameId, ws);
    gamesCacheRepository.incrementFanCount(gameId).catch((err: Error) => {
      console.error('Failed to increment fan count', { gameId, error: err.message });
    });

    // 4. Subscribe to Redis channel for this game (only once per channel)
    const channel = `lgf:v1:game:${gameId}:events`;
    if (!subscribedChannels.has(channel)) {
      await redisSubscriber.subscribe(channel);
      subscribedChannels.add(channel);
    }

    // 5. Handle disconnect cleanup
    ws.on('close', () => {
      registry.unregister(gameId, ws);
      gamesCacheRepository.decrementFanCount(gameId).catch((err: Error) => {
        console.error('Failed to decrement fan count', { gameId, error: err.message });
      });

      // Unsubscribe from Redis channel if no more connections for this game
      if (registry.getGameCount(gameId) === 0) {
        subscribedChannels.delete(channel);
        redisSubscriber.unsubscribe(channel).catch((err: Error) => {
          console.error('Failed to unsubscribe from channel', { channel, error: err.message });
        });
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error', { gameId, error: err.message });
    });
  });

  return wss;
}

/**
 * Broadcasts a status_change message to all connections for a game,
 * then schedules socket closure after 5 seconds for final/cancelled games.
 */
export function broadcastStatusChange(
  dispatcher: WsMessageDispatcher,
  registry: WsConnectionRegistry,
  gameId: string,
  status: string,
): void {
  const message: WsMessage = {
    type: 'status_change',
    payload: { status },
    timestamp: new Date().toISOString(),
  };

  dispatcher.dispatch(gameId, message);

  if (status === 'final' || status === 'cancelled') {
    setTimeout(() => {
      const connections = registry.getConnections(gameId);
      for (const ws of connections) {
        ws.close(1000, 'Game has ended');
      }
    }, 5000);
  }
}
