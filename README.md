# Live Game Feed API

A real-time sports game feed API built as a portfolio project for a GameChanger interview.

The core design challenge: **write/read asymmetry**. One coach writes game events. Thousands of fans read game state in real time via WebSocket. The system handles this by making the write path synchronous and transactionally safe, while the read path is served from Redis at O(1) cost per fan.

---

## Architecture

```
Coach
  |
  v
POST /api/v1/games/:gameId/events
  |
  v
EventsService
  |--- DB Transaction (INSERT event + UPDATE score) --- PostgreSQL
  |
  |--- [fire-and-forget post-commit]
  |     |
  |     +--- GamesCacheRepository.setGameState()  ----> Redis Hash
  |     +--- GamesCacheRepository.pushRecentEvent() --> Redis List
  |     +--- EventPublisher.publish()              ----> Redis Pub/Sub
  |
  v
redisSubscriber (dedicated connection)
  |
  v
WsMessageDispatcher
  |
  v
WebSocket connections (10,000 fans reading game state)
```

**Fan connect flow:**
```
Fan connects to /ws/games/:gameId
  |
  +--- Sends game_state catch-up (Redis HGETALL + LRANGE)
  |
  +--- Registers in WsConnectionRegistry
  |
  +--- Subscribes Redis channel (once per game)
  |
  +--- Streams event_update and status_change messages
```

---

## Key Design Decisions

### Why Redis Pub/Sub instead of direct WebSocket fan-out from the write path?

Decoupling. The HTTP request that submits an event should return as fast as possible. By publishing to Redis after the transaction commits, the write path is complete. The subscriber distributes to all fans independently. This also enables horizontal scaling — multiple API server instances each subscribe and each serve their own WebSocket fans without coordination.

### Why an append-only events table?

Events never need to be updated. A basket happened. That fact is permanent. Corrections are new events of type `correction` with a negative `score_delta`. This means the events table is a complete audit trail of everything that happened in a game. Scores on the games table are denormalized for O(1) reads — the events table is the source of truth for history.

### Why WebSocket over SSE or polling?

10,000:1 fan ratio means long-polling would put enormous load on the database. SSE is simpler but WebSocket gives us bidirectional protocol for future use (fan interactions, coach acknowledgements). The 30-second ping keeps connections alive through load balancers and mobile networks.

### Why Redis hashes for game state instead of JSON strings?

HSET allows partial field updates without re-serializing the full object. HGETALL retrieves all fields atomically. For a game that updates scores frequently, this avoids serialization overhead on every event.

### Why cursor-based pagination instead of OFFSET?

OFFSET degrades at scale — the database still reads and discards all rows before the offset. Cursor-based pagination using `created_at` as the cursor is O(log n) via the index regardless of how deep into the list you paginate.

---

## Setup

### Prerequisites

- Node.js 20+
- A [Railway](https://railway.app) account with a Postgres and Redis service provisioned

> **Note:** `docker-compose.yml` is kept in the repo for reference but is no longer used for local development. Postgres and Redis are provided by Railway.

### Steps

```bash
# Clone and install
git clone <repo>
cd live-game-feed
npm install

# Configure environment
cp .env.example .env
```

Open `.env` and fill in the Railway connection strings:

- `DATABASE_URL` — Railway project → Postgres service → **Variables** tab → `DATABASE_URL`
- `REDIS_URL` — Railway project → Redis service → **Variables** tab → `REDIS_URL`

```bash
# Run migrations against your Railway Postgres instance
npm run migrate

# Seed sample data (logs API keys to console — save them)
npm run seed

# Start development server
npm run dev
```

The API is available at `http://localhost:3000/api/v1`.

---

## Demo

Open two terminals.

**Terminal 1 — Fan watching via WebSocket (requires wscat: `npm i -g wscat`):**
```bash
wscat -c "ws://localhost:3000/ws/games/<GAME_ID>"
```

**Terminal 2 — Coach submitting events:**
```bash
# Transition game to active
curl -X PATCH http://localhost:3000/api/v1/games/<GAME_ID>/status \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'

# Submit a basket event
curl -X POST http://localhost:3000/api/v1/games/<GAME_ID>/events \
  -H "Authorization: Bearer <COACH_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "basket",
    "scoreDelta": 2,
    "teamId": "<HOME_TEAM_ID>",
    "description": "Layup by #10",
    "period": 1,
    "clock": "09:30"
  }'
```

Watch the WebSocket terminal receive the `event_update` message in real time.

---

## API Reference

### Authentication

All write endpoints require `Authorization: Bearer <key>`.

| Key Type | Scope |
|----------|-------|
| Admin key | Full access to all endpoints |
| Game-scoped key | Can only submit events and read data for the assigned game |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/health | None | DB + Redis health check |

### Teams

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/teams | None | List all teams |
| POST | /api/v1/teams | Admin | Create a team |

### Players

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/teams/:teamId/players | None | List players on a team |
| POST | /api/v1/teams/:teamId/players | Admin | Add a player to a team |

### Games

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/games | None | List games (filterable by status, paginated) |
| POST | /api/v1/games | Admin | Create a game |
| GET | /api/v1/games/:gameId | None | Get a game by id |
| PATCH | /api/v1/games/:gameId/status | Any valid key | Transition game status |

**Game status state machine:** `scheduled → active → final` or `scheduled/active → cancelled`

### Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/games/:gameId/events | Coach or Admin | Submit a game event |
| GET | /api/v1/games/:gameId/events | None | List events for a game (paginated) |

**Event types:** `basket`, `three_pointer`, `free_throw`, `foul`, `timeout`, `period_end`, `game_start`, `game_end`, `correction`, `substitution`, `turnover`

### API Keys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/api-keys | Admin | Generate a new key (raw key shown once) |
| DELETE | /api/v1/api-keys/:keyId | Admin | Revoke a key |

### WebSocket

Connect to: `ws://localhost:3000/ws/games/:gameId`

**Messages you will receive:**

| Type | When | Payload |
|------|------|---------|
| `game_state` | On connect | Full game state + last 25 events |
| `event_update` | Each event submitted | Event + updated scores |
| `status_change` | Game status changes | `{ status: "final" }` |
| `ping` | Every 30 seconds | Keep-alive |
| `error` | Game not found | Error message |

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (no external dependencies)
npm run test:unit

# Integration tests (requires DB + Redis — values are read from .env)
npm run test:integration

# E2E tests (requires DB + Redis — values are read from .env)
npm run test:e2e

# Coverage report
npm test -- --coverage
```

---

## Production Build

```bash
npm run build
npm start
```

Or with Docker:
```bash
docker build -t live-game-feed .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  live-game-feed
```

---

## Project Structure

```
src/
├── config/           # Env parsing (Zod), pg Pool, Redis clients
├── domains/          # Business domains
│   ├── auth/         # API key management
│   ├── games/        # Game CRUD + state machine + cache
│   ├── events/       # Event submission + pub/sub publishing
│   ├── teams/        # Team management
│   └── players/      # Player roster management
├── controllers/      # HTTP request/response only
├── routes/           # Express routing + Zod schema validation
├── middleware/       # Auth, error handling, rate limiting, request ID
├── infrastructure/
│   ├── websocket/    # WS server, connection registry, message dispatcher
│   └── cleanup/      # Background job for Redis TTL cleanup
└── shared/           # Errors, response envelope, pagination utilities
```
