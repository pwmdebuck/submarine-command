import type { Coord, Direction, GameRoom, Player, ScenarioId, SystemName, Team } from './types'

// ─── Client → Server ──────────────────────────────────────────────────────────

export interface ClientToServerEvents {
  // Lobby
  'room:create': (payload: { playerName: string; scenario: ScenarioId }, ack: (roomId: string) => void) => void
  'room:join':   (payload: { roomId: string; playerName: string; team: Team; role: string }, ack: (ok: boolean, error?: string) => void) => void
  'game:start':  (payload: { roomId: string }) => void

  // Captain
  'captain:setStart':     (payload: { roomId: string; position: Coord }) => void
  'captain:move':         (payload: { roomId: string; direction: Direction }) => void
  'captain:surface':      (payload: { roomId: string }) => void
  'captain:diveReady':    (payload: { roomId: string }) => void
  'captain:detonateMine': (payload: { roomId: string; position: Coord }) => void

  // Systems
  'system:activate':  (payload: { roomId: string; system: SystemName; params?: Record<string, unknown> }) => void

  // Engineer
  'engineer:markBreakdown': (payload: { roomId: string; symbolIndex: number; panel: string; circuitType: string }) => void
  'engineer:secureSection': (payload: { roomId: string }) => void

  // First Mate
  'firstMate:markGauge': (payload: { roomId: string; system: SystemName }) => void

  // Radio Operator
  'radioOp:trackMove': (payload: { roomId: string; direction: Direction }) => void
  'radioOp:estimate':  (payload: { roomId: string; position: { row: number; col: number } | null; age: number }) => void

  // Combat responses (enemy team confirms hit)
  'combat:respondHit': (payload: { roomId: string; result: 'clear' | 'indirect' | 'direct' }) => void
}

// ─── Server → Client ──────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  // Room state
  'room:updated':  (room: GameRoom) => void
  'game:started':  (room: GameRoom) => void
  'game:ended':    (payload: { winner: Team; reason: string }) => void

  // Captain broadcasts (heard by own team + enemy radio op)
  'captain:moved':    (payload: { team: Team; direction: Direction }) => void
  'captain:surfaced': (payload: { team: Team; sector: number }) => void
  'captain:dived':    (payload: { team: Team }) => void

  // System events (team-scoped)
  'system:ready':     (payload: { team: Team; system: SystemName }) => void
  'system:activated': (payload: { team: Team; system: SystemName; params?: Record<string, unknown> }) => void

  // Combat
  'combat:incoming':  (payload: { type: 'torpedo' | 'mine'; targetCoord: Coord }) => void
  'combat:resolved':  (payload: { team: Team; result: 'clear' | 'indirect' | 'direct'; newDamage: number }) => void

  // Drone / Sonar (resolved server-side)
  'drone:result':  (payload: { inSector: boolean }) => void
  'sonar:clues':   (payload: { clue1: string; clue2: string }) => void

  // Surfacing flow
  'surface:sectionNeeded': (payload: { team: Team; nextPlayerId: string }) => void
  'surface:complete':      (payload: { team: Team }) => void

  // Engineer
  'engineer:breakdownUpdated': (payload: { team: Team; breakdowns: unknown[] }) => void
  'engineer:damage':           (payload: { team: Team; newDamage: number }) => void

  // Turn-by-turn
  'turn:changed': (payload: { team: Team }) => void

  // Radio Operator estimate (team-scoped)
  'radioOp:estimate': (payload: { position: { row: number; col: number } | null; age: number }) => void

  // Error
  'error': (payload: { message: string }) => void
}

// ─── Inter-server (not used yet) ──────────────────────────────────────────────
export interface InterServerEvents {}

// ─── Per-socket data ──────────────────────────────────────────────────────────
export interface SocketData {
  player: Player
  roomId: string
}
