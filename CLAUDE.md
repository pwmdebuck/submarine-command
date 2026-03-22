# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs server on :3001 and client on :5173 concurrently)
npm run dev

# Build all packages (shared → server → client)
npm run build

# Build individual packages
npm run build --workspace=shared
npm run build --workspace=server
npm run build --workspace=client

# Run server in production
cd server && npm run start
```

No test suite is configured.

## Architecture

This is a TypeScript monorepo for **Submarine Command**, a real-time multiplayer submarine combat game. Three npm workspaces:

- **`shared/`** — Types, Socket.IO event contracts, and map definitions consumed by both client and server
- **`server/`** — Express + Socket.IO backend with in-memory game state (no database)
- **`client/`** — React + Vite frontend with Zustand state management

### Data Flow

1. Client connects via Socket.IO to server (`localhost:3001`; Vite proxies `/socket.io` and `/api` in dev)
2. All game state lives server-side in `roomStore.ts` (in-memory `Map`)
3. Server emits `room:updated` after every state mutation; clients re-render from the full room snapshot
4. REST endpoints in `roomRouter.ts` (`POST /api/rooms`, `GET /api/rooms/:id`) handle lobby creation/fetch

### Shared Package

`shared/src/` defines the full game contract:
- **`types.ts`** — All core types: `GameRoom`, `TeamState`, `SubmarineState`, `SystemsState`, roles, directions, phases
- **`events.ts`** — Typed Socket.IO events split into client→server and server→client
- **`maps.ts`** — Five 15×15 scenario maps (Alpha–Echo) with island positions and sector layouts

### Server

- **`index.ts`** — Entry point; wires Express + Socket.IO, serves on port 3001
- **`gameHandlers.ts`** — All game logic: movement validation, system activation, combat, phase transitions
- **`roomStore.ts`** — In-memory room state; creates rooms, manages system gauges, damage tracking
- **`roomRouter.ts`** — REST routes for room creation and state fetch

### Client

- **`App.tsx`** — Socket lifecycle + routes between Lobby and Game pages
- **`socket.ts`** — Typed Socket.IO client (autoConnect: false)
- **`store.ts`** — Zustand store: player identity, room ID, current room snapshot
- **`pages/Lobby.tsx`** — Room create/join, scenario/team/role selection
- **`pages/Game.tsx`** — Renders the correct role component based on `player.role`
- **`roles/`** — Four role UIs: `Captain` (SVG map + movement), `FirstMate` (system gauges), `Engineer` (circuit breakdown panels), `RadioOperator` (draggable overlay map for tracking enemy)

### Game Domain

Each game has two teams; each team has four roles:
- **Captain** — moves the submarine (N/E/S/W), activates systems, selects starting position
- **First Mate** — marks system gauges, activates weapon/detection/special systems, tracks hull damage
- **Engineer** — manages circuit breakdown panels (W/N/S/E directions × symbol types)
- **Radio Operator** — tracks enemy captain's moves on a draggable overlay map

Systems use a fill→ready→activate flow. Damage is 0–4 scale. Islands cause invalid moves.
