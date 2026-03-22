import type { GameRoom, ScenarioId, GameMode, Team, SystemName } from '@submarine/shared'
import { MAPS } from '@submarine/shared'

function makeGauge(total: number) {
  return { filled: 0, total, ready: false }
}

function makeEngineerState() {
  // 4 panels × (2 central + 2 reactor) = simplified; full layout handled client-side
  return {
    breakdowns: [],
    radiationCount: 0,
  }
}

function makeSubmarineState() {
  return {
    position: null,
    route: [],
    mines: [],
    damage: 0,
    silentMovesRemaining: 0,
    systems: {
      mine:     makeGauge(3),
      torpedo:  makeGauge(4),
      drone:    makeGauge(4),
      sonar:    makeGauge(3),
      silence:  makeGauge(6),
      scenario: makeGauge(12),
    },
    engineer: makeEngineerState(),
    surfacing: null,
    pendingTasks: { engineerDone: true, firstMateDone: true },
    lastMoveDirection: null,
  }
}

export function createRoom(scenario: ScenarioId, mode: GameMode): GameRoom {
  return {
    id: Math.random().toString(36).slice(2, 8).toUpperCase(),
    scenario,
    mode,
    phase: 'lobby',
    turn: null,
    createdAt: Date.now(),
    teams: {
      alpha: { players: [], submarine: makeSubmarineState() },
      beta:  { players: [], submarine: makeSubmarineState() },
    },
  }
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const rooms = new Map<string, GameRoom>()

export const roomStore = {
  get: (id: string) => rooms.get(id),

  create: (scenario: ScenarioId, mode: GameMode) => {
    const room = createRoom(scenario, mode)
    rooms.set(room.id, room)
    return room
  },

  save: (room: GameRoom) => {
    rooms.set(room.id, room)
  },

  count: () => rooms.size,

  // Mark a gauge space for a system, return whether it just became ready
  tickGauge: (room: GameRoom, team: Team, system: SystemName): boolean => {
    const gauge = room.teams[team].submarine.systems[system]
    if (gauge.filled < gauge.total) {
      gauge.filled++
      if (gauge.filled === gauge.total) {
        gauge.ready = true
        return true
      }
    }
    return false
  },

  resetGauge: (room: GameRoom, team: Team, system: SystemName) => {
    const gauge = room.teams[team].submarine.systems[system]
    gauge.filled = 0
    gauge.ready = false
  },

  addDamage: (room: GameRoom, team: Team, amount: number): number => {
    room.teams[team].submarine.damage = Math.min(
      4,
      room.teams[team].submarine.damage + amount
    )
    return room.teams[team].submarine.damage
  },

  isIsland: (room: GameRoom, row: number, col: number): boolean => {
    const map = MAPS[room.scenario]
    return map.islands.some((c) => c.row === row && c.col === col)
  },
}
