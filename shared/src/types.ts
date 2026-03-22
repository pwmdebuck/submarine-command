// ─── Core enums ───────────────────────────────────────────────────────────────

export type Team = 'alpha' | 'beta'

export type Role = 'captain' | 'firstMate' | 'engineer' | 'radioOperator'

export type Direction = 'N' | 'S' | 'E' | 'W'

export type SystemName = 'mine' | 'torpedo' | 'drone' | 'sonar' | 'silence' | 'scenario'

export type GameMode = 'realtime' | 'turnbyturn'

export type GamePhase =
  | 'lobby'
  | 'setup'       // players choosing starting position
  | 'playing'
  | 'surfacing'   // one team is surfacing
  | 'ended'

// ─── Grid ─────────────────────────────────────────────────────────────────────

export interface Coord {
  row: number   // 0-indexed
  col: number   // 0-indexed
}

// ─── Player / Room ────────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  team: Team
  role: Role
}

export interface GameRoom {
  id: string
  scenario: ScenarioId
  mode: GameMode
  phase: GamePhase
  teams: Record<Team, TeamState>
  turn: Team | null   // whose turn it is in turn-by-turn mode
  createdAt: number
}

// ─── Team state ───────────────────────────────────────────────────────────────

export interface TeamState {
  players: Player[]
  submarine: SubmarineState
}

export interface PendingTasks {
  engineerDone: boolean    // true = engineer has acted (or no move pending)
  firstMateDone: boolean   // true = first mate has acted (or no move pending)
}

export interface SubmarineState {
  position: Coord | null
  route: Coord[]           // ordered list of visited positions
  mines: Coord[]           // placed mine positions
  damage: number           // 0–4
  silentMovesRemaining: number  // >0 means captain:moved is suppressed
  systems: SystemsState
  engineer: EngineerState
  surfacing: SurfacingState | null
  pendingTasks: PendingTasks
  lastMoveDirection: Direction | null  // which panel the engineer must mark this turn
}

// ─── Systems / First Mate ──────────────────────────────────────────────────────

export interface SystemsState {
  mine:     SystemGauge
  torpedo:  SystemGauge
  drone:    SystemGauge
  sonar:    SystemGauge
  silence:  SystemGauge
  scenario: SystemGauge
}

export interface SystemGauge {
  filled: number   // how many spaces are marked
  total: number    // total spaces on this gauge
  ready: boolean   // filled === total
}

// ─── Engineer ─────────────────────────────────────────────────────────────────

export type ControlPanel = 'N' | 'S' | 'E' | 'W'
export type CircuitType = 'central' | 'reactor'

export interface BreakdownCell {
  panel: ControlPanel
  circuitType: CircuitType
  symbolIndex: number  // position within the panel
  broken: boolean
}

export interface EngineerState {
  breakdowns: BreakdownCell[]
  radiationCount: number  // how many radiation symbols crossed
}

// ─── Surfacing ────────────────────────────────────────────────────────────────

export interface SurfacingState {
  sector: number
  sectionsSecured: string[]  // player ids who have signed off
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export type ScenarioId = 'alpha' | 'bravo' | 'charlie' | 'delta' | 'echo'
