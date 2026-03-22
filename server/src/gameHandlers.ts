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
import { MAPS } from '@submarine/shared'

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const DIRECTION_DELTA: Record<Direction, Coord> = {
  N: { row: -1, col: 0 },
  S: { row:  1, col: 0 },
  E: { row:  0, col: 1 },
  W: { row:  0, col: -1 },
}

// ── Engineer system locking ───────────────────────────────────────────────────

const CENTRAL_SYMBOL_TYPES_BY_PANEL: Record<string, string[]> = {
  W: ['mine-torpedo',     'silence-scenario', 'drone-sonar'     ],
  N: ['drone-sonar',      'mine-torpedo',     'silence-scenario'],
  S: ['silence-scenario', 'drone-sonar',      'mine-torpedo'    ],
  E: ['mine-torpedo',     'drone-sonar',      'silence-scenario'],
}
const REACTOR_SYMBOL_TYPES_BY_PANEL: Record<string, string[]> = {
  W: ['drone-sonar', 'radiation',    'radiation'       ],
  N: ['drone-sonar', 'mine-torpedo', 'radiation'       ],
  S: ['mine-torpedo','radiation',    'silence-scenario'],
  E: ['radiation',   'drone-sonar',  'radiation'       ],
}
const TOTAL_RADIATION = Object.values(REACTOR_SYMBOL_TYPES_BY_PANEL)
  .flat().filter((t) => t === 'radiation').length  // = 6
const SYSTEM_SYMBOL_TYPE: Partial<Record<string, string>> = {
  mine: 'mine-torpedo', torpedo: 'mine-torpedo',
  drone: 'drone-sonar', sonar: 'drone-sonar',
  silence: 'silence-scenario', scenario: 'silence-scenario',
}

function isSystemLocked(eng: { breakdowns: { circuitType: string; symbolIndex: number; panel: string }[] }, system: string): boolean {
  const symbolType = SYSTEM_SYMBOL_TYPE[system]
  if (!symbolType) return false
  return eng.breakdowns.some((b) => {
    const t = b.circuitType === 'central'
      ? CENTRAL_SYMBOL_TYPES_BY_PANEL[b.panel]?.[b.symbolIndex]
      : REACTOR_SYMBOL_TYPES_BY_PANEL[b.panel]?.[b.symbolIndex]
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

  socket.on('dev:godMode', ({ enabled }) => {
    socket.data.godMode = enabled
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

    const godMode = socket.data.godMode ?? false

    // Validate: not out of bounds (always enforced)
    const map = { rows: 15, cols: 15 }
    if (next.row < 0 || next.row >= map.rows || next.col < 0 || next.col >= map.cols) {
      socket.emit('error', { message: 'Out of bounds' })
      return
    }

    if (!godMode) {
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
    }

    // Apply move
    sub.position = next
    sub.route.push(next)
    sub.pendingTasks = { engineerDone: false, firstMateDone: false }
    sub.lastMoveDirection = direction

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
  })

  socket.on('captain:detonateMine', ({ roomId, position }) => {
    const room = roomStore.get(roomId)
    if (!room || !socket.data.player) return
    const { team } = socket.data.player
    const sub = room.teams[team].submarine
    const enemyTeam: Team = team === 'alpha' ? 'beta' : 'alpha'

    const mineIndex = sub.mines.findIndex((m) => m.row === position.row && m.col === position.col)
    if (mineIndex === -1) return

    sub.mines.splice(mineIndex, 1)

    const enemySub = room.teams[enemyTeam].submarine

    function blastDamage(subPos: Coord | null): number {
      if (!subPos) return 0
      const d = Math.max(Math.abs(subPos.row - position.row), Math.abs(subPos.col - position.col))
      return d === 0 ? 2 : d === 1 ? 1 : 0
    }

    const selfDmg = blastDamage(sub.position)
    const enemyDmg = blastDamage(enemySub.position)

    if (selfDmg > 0) roomStore.addDamage(room, team, selfDmg)
    if (enemyDmg > 0) roomStore.addDamage(room, enemyTeam, enemyDmg)

    roomStore.save(room)
    io.to(roomId).emit('room:updated', room)
    if (selfDmg > 0) io.to(roomId).emit('combat:resolved', { team, result: selfDmg >= 2 ? 'direct' : 'indirect', newDamage: room.teams[team].submarine.damage })
    if (enemyDmg > 0) io.to(roomId).emit('combat:resolved', { team: enemyTeam, result: enemyDmg >= 2 ? 'direct' : 'indirect', newDamage: room.teams[enemyTeam].submarine.damage })
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
    const godMode = socket.data.godMode ?? false

    if (!godMode) {
      if (!gauge.ready) {
        socket.emit('error', { message: `${system} not ready` })
        return
      }

      if (isSystemLocked(sub.engineer, system)) {
        socket.emit('error', { message: `${system} is locked due to an engineer breakdown` })
        return
      }
    }

    const enemyTeam: Team = team === 'alpha' ? 'beta' : 'alpha'

    roomStore.resetGauge(room, team, system)

    if (system === 'torpedo') {
      const pos = params?.position as Coord | undefined
      if (!pos || !sub.position) return

      const dist = Math.abs(pos.row - sub.position.row) + Math.abs(pos.col - sub.position.col)
      if (dist > 4) return

      const enemySub = room.teams[enemyTeam].submarine

      function blastDamage(subPos: Coord | null): number {
        if (!subPos) return 0
        const d = Math.max(Math.abs(subPos.row - pos!.row), Math.abs(subPos.col - pos!.col))
        return d === 0 ? 2 : d === 1 ? 1 : 0
      }

      const selfDmg = blastDamage(sub.position)
      const enemyDmg = blastDamage(enemySub.position)

      if (selfDmg > 0) roomStore.addDamage(room, team, selfDmg)
      if (enemyDmg > 0) roomStore.addDamage(room, enemyTeam, enemyDmg)

      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params })
      io.to(roomId).emit('room:updated', room)
      if (selfDmg > 0) io.to(roomId).emit('combat:resolved', { team, result: selfDmg >= 2 ? 'direct' : 'indirect', newDamage: room.teams[team].submarine.damage })
      if (enemyDmg > 0) io.to(roomId).emit('combat:resolved', { team: enemyTeam, result: enemyDmg >= 2 ? 'direct' : 'indirect', newDamage: room.teams[enemyTeam].submarine.damage })
      return
    }

    if (system === 'mine') {
      if (!sub.position) return
      const pos = params?.position as Coord | undefined
      if (!pos) return

      const dr = Math.abs(pos.row - sub.position.row)
      const dc = Math.abs(pos.col - sub.position.col)
      if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return
      if (sub.route.some((r) => r.row === pos.row && r.col === pos.col)) return
      const mapDef = MAPS[room.scenario]
      if (mapDef.islands.some((i) => i.row === pos.row && i.col === pos.col)) return

      sub.mines.push({ ...pos })
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

    if (system === 'scenario') {
      if (sub.damage === 0) return
      sub.damage = sub.damage - 1
      roomStore.save(room)
      io.to(roomId).emit('system:activated', { team, system, params: { newDamage: sub.damage } })
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

    const isRadiation = circuitType === 'reactor' &&
      REACTOR_SYMBOL_TYPES_BY_PANEL[panel]?.[symbolIndex] === 'radiation'

    if (existingIdx >= 0) {
      // Unmark — also undo radiation count if applicable
      if (isRadiation) {
        eng.radiationCount = Math.max(0, eng.radiationCount - 1)
      }
      eng.breakdowns.splice(existingIdx, 1)
    } else {
      eng.breakdowns.push({ panel: panel as ControlPanel, circuitType: circuitType as CircuitType, symbolIndex, broken: true })

      if (isRadiation) {
        eng.radiationCount++
        if (eng.radiationCount >= TOTAL_RADIATION) {
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

    // Central circuit auto-repair
    // Circuit 0 (orange): S[0], S[1], S[2], E[0]
    // Circuit 1 (grey):   N[0], N[1], N[2], E[1]
    // Circuit 2 (yellow): W[0], W[1], W[2], E[2]
    if (circuitType === 'central') {
      const CIRCUITS_CENTRAL = [
        [{ panel: 'S', idx: 0 }, { panel: 'S', idx: 1 }, { panel: 'S', idx: 2 }, { panel: 'E', idx: 0 }],
        [{ panel: 'N', idx: 0 }, { panel: 'N', idx: 1 }, { panel: 'N', idx: 2 }, { panel: 'E', idx: 1 }],
        [{ panel: 'W', idx: 0 }, { panel: 'W', idx: 1 }, { panel: 'W', idx: 2 }, { panel: 'E', idx: 2 }],
      ]
      for (const circuit of CIRCUITS_CENTRAL) {
        const allMarked = circuit.every(({ panel: p, idx }) =>
          eng.breakdowns.some((b) => b.panel === p && b.circuitType === 'central' && b.symbolIndex === idx)
        )
        if (allMarked) {
          eng.breakdowns = eng.breakdowns.filter(
            (b) => !circuit.some(({ panel: p, idx }) =>
              b.panel === p && b.circuitType === 'central' && b.symbolIndex === idx
            )
          )
        }
      }
    }

    // Area breakdown: all symbols in one panel broken → damage + full repair
    const allPanels: ControlPanel[] = ['W', 'N', 'S', 'E']
    for (const p of allPanels) {
      const centralBroken = [0, 1, 2].every((i) =>
        eng.breakdowns.some((b) => b.panel === p && b.circuitType === 'central' && b.symbolIndex === i)
      )
      const reactorLen = REACTOR_SYMBOL_TYPES_BY_PANEL[p].length
      const reactorBroken = Array.from({ length: reactorLen }, (_, i) => i).every((i) =>
        eng.breakdowns.some((b) => b.panel === p && b.circuitType === 'reactor' && b.symbolIndex === i)
      )
      if (centralBroken && reactorBroken) {
        const newDamage = roomStore.addDamage(room, team, 1)
        eng.breakdowns = []
        eng.radiationCount = 0
        roomStore.save(room)
        io.to(roomId).emit('engineer:damage', { team, newDamage })
        io.to(roomId).emit('room:updated', room)
        return
      }
    }

    roomStore.save(room)
    io.to(roomId).emit('engineer:breakdownUpdated', { team, breakdowns: eng.breakdowns })
    io.to(roomId).emit('room:updated', room)
  })

}
