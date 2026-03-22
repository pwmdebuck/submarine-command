import type { Coord, ScenarioId } from './types'

export interface ScenarioMap {
  id: ScenarioId
  label: string
  rows: number
  cols: number
  sectors: number    // 9 in real-time, 4 in turn-by-turn
  islands: Coord[]   // cells that cannot be entered
  specialCells?: Coord[]  // e.g. ice holes in Delta
}

// Alpha map — 15×15, many small islands
export const ALPHA_MAP: ScenarioMap = {
  id: 'alpha',
  label: 'Alpha',
  rows: 15,
  cols: 15,
  sectors: 9,
  islands: [
    // Row 0
    { row: 0, col: 5 }, { row: 0, col: 11 },
    // Row 1
    { row: 1, col: 2 }, { row: 1, col: 8 },
    // Row 2
    { row: 2, col: 4 }, { row: 2, col: 12 },
    // Row 3
    { row: 3, col: 1 }, { row: 3, col: 7 }, { row: 3, col: 13 },
    // Row 4
    { row: 4, col: 3 }, { row: 4, col: 10 },
    // Row 5
    { row: 5, col: 6 }, { row: 5, col: 14 },
    // Row 6
    { row: 6, col: 0 }, { row: 6, col: 9 },
    // Row 7
    { row: 7, col: 2 }, { row: 7, col: 5 }, { row: 7, col: 11 },
    // Row 8
    { row: 8, col: 7 }, { row: 8, col: 13 },
    // Row 9
    { row: 9, col: 1 }, { row: 9, col: 4 },
    // Row 10
    { row: 10, col: 8 }, { row: 10, col: 12 },
    // Row 11
    { row: 11, col: 3 }, { row: 11, col: 6 }, { row: 11, col: 14 },
    // Row 12
    { row: 12, col: 0 }, { row: 12, col: 9 },
    // Row 13
    { row: 13, col: 2 }, { row: 13, col: 11 },
    // Row 14
    { row: 14, col: 5 }, { row: 14, col: 13 },
  ],
}

// Bravo map — 15×15, more open
export const BRAVO_MAP: ScenarioMap = {
  id: 'bravo',
  label: 'Bravo',
  rows: 15,
  cols: 15,
  sectors: 9,
  islands: [
    { row: 1, col: 3 }, { row: 1, col: 11 },
    { row: 3, col: 6 }, { row: 3, col: 13 },
    { row: 5, col: 1 }, { row: 5, col: 9 },
    { row: 7, col: 4 }, { row: 7, col: 12 },
    { row: 9, col: 0 }, { row: 9, col: 7 },
    { row: 11, col: 2 }, { row: 11, col: 10 },
    { row: 13, col: 5 }, { row: 13, col: 14 },
  ],
}

// Charlie map — 15×15, sparse islands
export const CHARLIE_MAP: ScenarioMap = {
  id: 'charlie',
  label: 'Charlie',
  rows: 15,
  cols: 15,
  sectors: 9,
  islands: [
    { row: 2, col: 7 },
    { row: 5, col: 3 }, { row: 5, col: 11 },
    { row: 7, col: 0 }, { row: 7, col: 14 },
    { row: 9, col: 5 }, { row: 9, col: 9 },
    { row: 12, col: 2 }, { row: 12, col: 12 },
  ],
}

// Delta map — 15×15, ice holes are valid surfacing spots
export const DELTA_MAP: ScenarioMap = {
  id: 'delta',
  label: 'Delta',
  rows: 15,
  cols: 15,
  sectors: 9,
  islands: [
    { row: 0, col: 0 }, { row: 0, col: 14 },
    { row: 14, col: 0 }, { row: 14, col: 14 },
    { row: 3, col: 3 }, { row: 3, col: 11 },
    { row: 7, col: 7 },
    { row: 11, col: 3 }, { row: 11, col: 11 },
  ],
  specialCells: [
    // Open water holes — valid surface points
    { row: 2, col: 7 },
    { row: 7, col: 2 },
    { row: 7, col: 12 },
    { row: 12, col: 7 },
  ],
}

// Echo map — 15×15, Archer mines pre-placed
export const ECHO_MAP: ScenarioMap = {
  id: 'echo',
  label: 'Echo',
  rows: 15,
  cols: 15,
  sectors: 9,
  islands: [
    { row: 1, col: 5 }, { row: 1, col: 10 },
    { row: 4, col: 2 }, { row: 4, col: 13 },
    { row: 7, col: 6 }, { row: 7, col: 8 },
    { row: 10, col: 1 }, { row: 10, col: 12 },
    { row: 13, col: 4 }, { row: 13, col: 9 },
  ],
  specialCells: [
    // Archer mine positions
    { row: 3, col: 7 },
    { row: 6, col: 3 },
    { row: 6, col: 11 },
    { row: 9, col: 5 },
    { row: 9, col: 9 },
    { row: 12, col: 7 },
  ],
}

export const MAPS: Record<ScenarioId, ScenarioMap> = {
  alpha: ALPHA_MAP,
  bravo: BRAVO_MAP,
  charlie: CHARLIE_MAP,
  delta: DELTA_MAP,
  echo: ECHO_MAP,
}
