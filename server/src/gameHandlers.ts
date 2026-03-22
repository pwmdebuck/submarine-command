import type { Server, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  Team,
  Role,
  Coord,
  Direction,
  ControlPanel,
  CircuitType,
} from '@submarine/shared'
import { roomStore } from './roomStore.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const DIRECTION_DELTA: Record<Direction, Coord> = {
  N: { row: -1, col: 0 },
  S: { row:  1, col: 0 },
  E: { row:  0, col: 1 },
  W: { row:  0, col: -1 },
}

// ── Engineer system locking ───────────────────────────────────────────────────

const CENTRAL_SYMBOL_TYPES = ['mine-torpedo', 'drone-sonar', 'silence-scenario', 'mine-torpedo']
const REACTOR_SYMBOL_TYPES = ['drone-sonar', 'silence-scenario', 'radiation']
const SYSTEM_SYMBOL_TYPE: Partial<Record<string, string>> = {
  mine: 'mine-torpedo', torpedo: 'mine-torpedo',
  drone: 'drone-sonar', sonar: 'drone-sonar',
  silence: 'silence-scenario', scenario: 'silence-scenario',
}

function isSystemLocked(eng: { breakdowns: { circuitType: string; symbolIndex: number }[] }, system: string): boolean {
  const symbolType = SYSTEM_SYMBOL_TYPE[system]
  if (!symbolType) return false
  return eng.breakdowns.some((b) => {
    const t = b.circuitType === 'central' ? CENTRAL_SYMBOL_TYPES[b.symbolIndex] : REACTOR_SYMBOL_TYPES[b.symbolIndex]
    return t === symbolType
  })
}

// ── Drone / Sonar server-side resolution ─────────────────────────────────────

function getSector(pos: Coord): number {
  return Math.floor(pos.row / 5) * 3 + Math.floor(pos.col / 5) + 1
}

function randomOther(exclude: number, min: number, max: number): number {
  let val: number
  do { val = Math.floor(Math.random() * (max - min + 1)) + min } while (val === exclude)
  return val
}

function generateSonarClues(pos: Coord): { clue1: string; clue2: string } {
  const sector = getSector(pos)
  const trueOptions = [`Row ${pos.row + 1}`, `Column ${pos.col + 1}`, `Sector ${sector}`]
  const lieOptions = [
    `Row ${randomOther(pos.row + 1, 1, 15)}`,
    `Column ${randomOther(pos.col + 1, 1, 15)}`,
    `Sector ${randomOther(sector, 1, 9)}`,
  ]
  const ti = Math.floor(Math.random() * 3)
  const li = (ti + 1 + Math.floor(Math.random() * 2)) % 3
  const [trueClue, lieClue] = [trueOptions[ti], lieOptions[li]]
  return Math.random() < 0.5 ? { clue1: trueClue, clue2: lieClue } : { clue1: lieClue, clue2: trueClue }
}

export function registerGameHandlers(io: IO, socket: Sock) {

  // ── Lobby ────────────────────────────────────────────────────────────────────

  socket.on('room:create', ({ playerName, scenario }, ack) => {
    const room = roomStore.create(scenario, 'realtime')
    socket.join(room.id)
    socket.join(`${room.id}-alpha`)
    socket.data.roomId = room.id
    socket.data.player = { id: socket.id, name: playerName, team: 'alpha', role: 'captain' }
    roomStore.save(room)
    ack(room.id)
    io.to(room.id).emit('room:updated', room)
  })

  socket.on('room:join', ({ roomId, playerName, team, role }, ack) => {
    const room = roomStore.get(roomId)
    if (!room) return ack(false, 'Room not found')

    const t = team as Team
    const r = role as Role

    // Check role not already taken
    const taken = room.teams[t].players.some((p) => p.role === r)
    if (taken) return ack(false, 'Role already taken')

    const player = { id: socket.id, name: playerName, team: t, role: r }
    room.teams[t].players.push(player)
    socket.data.player = player
    socket.data.roomId = roomId
    socket.join(roomId)
    socket.join(`${roomId}-${t}`)
    roomStore.save(room)

    ack(true)
    io.to(roomId).emit('room:updated', room)
  })

  socket.on('game:start', ({ roomId }) => {
    const room = roomStore.get(roomId)
    if (!room) return
    room.phase = 'setup'
    roomStore.save(room)
    io.to(roomId).emit('game:started', room)
  })

  // ── Captain ──────────────────────────────────────────────────────────────────

  socket.on('captain:setStart', ({ roomId, position }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    room.teams[team].submarine.position = position
    room.teams[team].submarine.route = [position]
    roomStore.save(room)
    io.to(roomId).emit('room:updated', room)
  })

  socket.on('captain:move', ({ roomId, direction }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    if (!sub.position) return

    const delta = DIRECTION_DELTA[direction]
    const next: Coord = {
      row: sub.position.row + delta.row,
      col: sub.position.col + delta.col,
    }

    // Validate: not out of bounds
    const map = { rows: 15, cols: 15 }
    if (next.row < 0 || next.row >= map.rows || next.col < 0 || next.col >= map.cols) {
      socket.emit('error', { message: 'Out of bounds' })
      return
    }

    // Validate: not an island
    if (roomStore.isIsland(room, next.row, next.col)) {
      socket.emit('error', { message: 'Cannot move into island' })
      return
    }

    // Validate: not crossing own route
    const onRoute = sub.route.some((c) => c.row === next.row && c.col === next.col)
    if (onRoute) {
      socket.emit('error', { message: 'Cannot cross own route' })
      return
    }

    // Validate: engineer and first mate have completed their tasks from last move
    if (!sub.pendingTasks.engineerDone || !sub.pendingTasks.firstMateDone) {
      socket.emit('error', { message: 'Waiting for Engineer and First Mate to complete their tasks' })
      return
    }

    // Apply move
    sub.position = next
    sub.route.push(next)
    sub.pendingTasks = { engineerDone: false, firstMateDone: false }
    sub.lastMoveDirection = direction

    // Check if sub sailed over an enemy mine
    const enemyTeamForMine: Team = team === 'alpha' ? 'beta' : 'alpha'
    const enemySubForMine = room.teams[enemyTeamForMine].submarine
    const hitMine = enemySubForMine.mines.some((m) => m.row === next.row && m.col === next.col)

    roomStore.save(room)

    // Broadcast direction to own team always; suppress from enemy when silent
    if (sub.silentMovesRemaining > 0) {
      sub.silentMovesRemaining--
      roomStore.save(room)
      io.to(`${roomId}-${team}`).emit('captain:moved', { team, direction })
    } else {
      io.to(roomId).emit('captain:moved', { team, direction })
    }

    io.to(roomId).emit('room:updated', room)

    if (hitMine) {
      io.to(`${roomId}-${team}`).emit('combat:incoming', { type: 'mine', targetCoord: next })
    }
  })

  socket.on('captain:surface', ({ roomId }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    if (!sub.position) return

    // Determine sector (3×3 grid of sectors over 15×15 map)
    const sector = Math.floor(sub.position.row / 5) * 3 + Math.floor(sub.position.col / 5) + 1
    const ghostIds = room.teams[team].players
      .filter(p => p.id.startsWith('ghost:'))
      .map(p => p.id)
    sub.surfacing = { sector, sectionsSecured: ghostIds }
    room.phase = 'surfacing'
    roomStore.save(room)

    io.to(roomId).emit('captain:surfaced', { team, sector })
    io.to(roomId).emit('room:updated', room)
  })

  socket.on('engineer:secureSection', ({ roomId }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    if (!sub.surfacing) return

    const playerId = socket.data.player.id
    if (!sub.surfacing.sectionsSecured.includes(playerId)) {
      sub.surfacing.sectionsSecured.push(playerId)
    }

    const teamSize = room.teams[team].players.length
    if (sub.surfacing.sectionsSecured.length >= Math.min(4, teamSize)) {
      // Surfacing complete — clear breakdowns, reset route
      sub.engineer.breakdowns = []
      sub.engineer.radiationCount = 0
      sub.route = sub.position ? [sub.position] : []
      sub.surfacing = null
      sub.pendingTasks = { engineerDone: true, firstMateDone: true }
      sub.lastMoveDirection = null
      room.phase = 'playing'
      roomStore.save(room)

      io.to(roomId).emit('surface:complete', { team })
      io.to(roomId).emit('room:updated', room)
    } else {
      roomStore.save(room)
      io.to(roomId).emit('room:updated', room)
    }
  })

  socket.on('captain:diveReady', ({ roomId }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    io.to(roomId).emit('captain:dived', { team })
  })

  // ── Systems ──────────────────────────────────────────────────────────────────

  socket.on('firstMate:markGauge', ({ roomId, system }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine

    if (sub.pendingTasks.firstMateDone) {
      socket.emit('error', { message: 'First Mate action already used this turn' })
      return
    }

    const becameReady = roomStore.tickGauge(room, team, system)
    sub.pendingTasks.firstMateDone = true
    roomStore.save(room)
    io.to(roomId).emit('room:updated', room)

    if (becameReady) {
      io.to(roomId).emit('system:ready', { team, system })
    }
  })

  socket.on('system:activate', ({ roomId, system, params }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    const gauge = sub.systems[system]
    if (!gauge.ready) {
      socket.emit('error', { message: `${system} not ready` })
      return
    }

    if (isSystemLocked(sub.engineer, system)) {
      socket.emit('error', { message: `${system} is locked due to an engineer breakdown` })
      return
    }

    const enemyTeam: Team = team === 'alpha' ? 'beta' : 'alpha'

    roomStore.resetGauge(room, team, system)

    if (system === 'torpedo') {
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      if (sub.position) {
        io.to(`${roomId}-${enemyTeam}`).emit('combat:incoming', { type: 'torpedo', targetCoord: sub.position })
      }
      return
    }

    if (system === 'mine') {
      if (sub.position) sub.mines.push({ ...sub.position })
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      return
    }

    if (system === 'drone') {
      const sector = (params?.sector as number) ?? 0
      const enemySub = room.teams[enemyTeam].submarine
      const inSector = enemySub.position !== null && getSector(enemySub.position) === sector
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      io.to(`${roomId}-${team}`).emit('drone:result', { inSector })
      return
    }

    if (system === 'sonar') {
      const enemySub = room.teams[enemyTeam].submarine
      const clues = enemySub.position
        ? generateSonarClues(enemySub.position)
        : { clue1: 'unknown', clue2: 'unknown' }
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      io.to(`${roomId}-${team}`).emit('sonar:clues', clues)
      return
    }

    if (system === 'silence') {
      sub.silentMovesRemaining = 4
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      return
    }

    roomStore.save(room)
    io.to(roomId).emit('system:activated', { team, system, params })
    io.to(roomId).emit('room:updated', room)
  })

  // ── Combat ───────────────────────────────────────────────────────────────────

  socket.on('combat:respondHit', ({ roomId, result }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player  // team taking the hit
    let damage = 0
    if (result === 'indirect') damage = 1
    if (result === 'direct') damage = 2

    if (damage > 0) {
      const newDamage = roomStore.addDamage(room, team, damage)
      roomStore.save(room)
      io.to(roomId).emit('combat:resolved', { team, result, newDamage })

      if (newDamage >= 4) {
        const winner: Team = team === 'alpha' ? 'beta' : 'alpha'
        room.phase = 'ended'
        roomStore.save(room)
        io.to(roomId).emit('game:ended', { winner, reason: `${team} submarine destroyed` })
      } else {
        io.to(roomId).emit('room:updated', room)
      }
    } else {
      io.to(roomId).emit('combat:resolved', { team, result, newDamage: room.teams[team].submarine.damage })
    }
  })

  // ── Radio Operator ───────────────────────────────────────────────────────────

  socket.on('radioOp:estimate', ({ roomId, position, age }) => {
    if (!socket.data.player) return
    const { team } = socket.data.player
    io.to(`${roomId}-${team}`).emit('radioOp:estimate', { position, age })
  })

  // ── Engineer ─────────────────────────────────────────────────────────────────

  socket.on('engineer:markBreakdown', ({ roomId, symbolIndex, panel, circuitType }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    const eng = sub.engineer

    if (sub.pendingTasks.engineerDone) {
      socket.emit('error', { message: 'Engineer action already used this turn' })
      return
    }

    if (sub.lastMoveDirection && panel !== sub.lastMoveDirection) {
      socket.emit('error', { message: `Must mark the ${sub.lastMoveDirection} panel` })
      return
    }

    const existingIdx = eng.breakdowns.findIndex(
      (b) => b.panel === panel && b.symbolIndex === symbolIndex && b.circuitType === circuitType
    )

    sub.pendingTasks.engineerDone = true

    if (existingIdx >= 0) {
      // Unmark — also undo radiation count if applicable
      if (circuitType === 'reactor' && symbolIndex === 2) {
        eng.radiationCount = Math.max(0, eng.radiationCount - 1)
      }
      eng.breakdowns.splice(existingIdx, 1)
    } else {
      eng.breakdowns.push({ panel: panel as ControlPanel, circuitType: circuitType as CircuitType, symbolIndex, broken: true })

      // Radiation symbol = reactor zone, index 2 (3rd reactor symbol)
      if (circuitType === 'reactor' && symbolIndex === 2) {
        eng.radiationCount++
        if (eng.radiationCount >= 4) {
          const newDamage = roomStore.addDamage(room, team, 1)
          eng.breakdowns = []
          eng.radiationCount = 0
          roomStore.save(room)
          io.to(roomId).emit('engineer:damage', { team, newDamage })
          io.to(roomId).emit('room:updated', room)
          return
        }
      }
    }

    roomStore.save(room)
    io.to(roomId).emit('engineer:breakdownUpdated', { team, breakdowns: eng.breakdowns })
    io.to(roomId).emit('room:updated', room)
  })

}
