import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import { MiniMap } from '../components/MiniMap'
import styles from './Engineer.module.css'

type Panel = 'W' | 'N' | 'S' | 'E'
type SymbolType = 'mine-torpedo' | 'drone-sonar' | 'silence-scenario' | 'radiation'
type CircuitId = 0 | 1 | 2

interface Symbol {
  panel: Panel
  zone: 'central' | 'reactor'
  type: SymbolType
  localIndex: number
  id: string
  circuitId?: CircuitId  // central only
}

// Central symbol types differ per panel (read from board layout)
const CENTRAL_TYPES_BY_PANEL: Record<Panel, SymbolType[]> = {
  'W': ['mine-torpedo',     'silence-scenario', 'drone-sonar'     ],
  'N': ['drone-sonar',      'mine-torpedo',     'silence-scenario'],
  'S': ['silence-scenario', 'drone-sonar',      'mine-torpedo'    ],
  'E': ['mine-torpedo',     'drone-sonar',      'silence-scenario'],
}


// Reactor symbols differ per panel
const REACTOR_TYPES_BY_PANEL: Record<Panel, SymbolType[]> = {
  'W': ['drone-sonar', 'radiation',    'radiation'       ],
  'N': ['drone-sonar', 'mine-torpedo', 'radiation'       ],
  'S': ['mine-torpedo','radiation',    'silence-scenario'],
  'E': ['radiation',   'drone-sonar',  'radiation'       ],
}
const TOTAL_RADIATION = (Object.values(REACTOR_TYPES_BY_PANEL) as SymbolType[][])
  .flat().filter((t) => t === 'radiation').length

const PANELS: Panel[] = ['W', 'N', 'S', 'E']

// Circuit assignment:
//   Circuit 0 (orange): S[0], S[1], S[2], E[0]
//   Circuit 1 (grey):   N[0], N[1], N[2], E[1]
//   Circuit 2 (yellow): W[0], W[1], W[2], E[2]
function getCircuitId(panel: Panel, localIndex: number): CircuitId {
  if (panel === 'E') return localIndex as CircuitId
  if (panel === 'W') return 2
  if (panel === 'N') return 1
  return 0 // S
}

function makeSymbols(): Symbol[] {
  const syms: Symbol[] = []
  PANELS.forEach((panel) => {
    CENTRAL_TYPES_BY_PANEL[panel].forEach((type, i) => {
      syms.push({
        panel, zone: 'central', type, localIndex: i,
        id: `${panel}-C${i}`,
        circuitId: getCircuitId(panel, i),
      })
    })
    REACTOR_TYPES_BY_PANEL[panel].forEach((type, i) => {
      syms.push({ panel, zone: 'reactor', type, localIndex: i, id: `${panel}-R${i}` })
    })
  })
  return syms
}

const ALL_SYMBOLS = makeSymbols()

// Circuit definitions (for completion check)
const CIRCUITS: { id: CircuitId; color: string; label: string; symbols: string[] }[] = [
  { id: 0, color: '#ff6633', label: 'Orange', symbols: ['S-C0', 'S-C1', 'S-C2', 'E-C0'] },
  { id: 1, color: '#aaaaaa', label: 'Grey',   symbols: ['N-C0', 'N-C1', 'N-C2', 'E-C1'] },
  { id: 2, color: '#ffcc00', label: 'Yellow', symbols: ['W-C0', 'W-C1', 'W-C2', 'E-C2'] },
]

const TYPE_COLORS: Record<SymbolType, string> = {
  'mine-torpedo':     '#ef4444',
  'drone-sonar':      '#00ff6a',
  'silence-scenario': '#ffaa00',
  'radiation':        '#cc44ff',
}

const TYPE_LABEL: Record<SymbolType, string> = {
  'mine-torpedo':     'Weapons',
  'drone-sonar':      'Detection',
  'silence-scenario': 'Special',
  'radiation':        '☢',
}

export function Engineer() {
  const { room, player } = useGameStore()
  const [estimate, setEstimate] = useState<{ row: number; col: number; age: number } | null>(null)

  useEffect(() => {
    socket.on('radioOp:estimate', ({ position, age }) =>
      setEstimate(position ? { ...position, age } : null)
    )
    return () => { socket.off('radioOp:estimate') }
  }, [])

  if (!room || !player) return null

  const sub = room.teams[player.team].submarine
  const actionUsed = sub.pendingTasks.engineerDone
  const activePanel = sub.lastMoveDirection

  const brokenIds = new Set(
    sub.engineer.breakdowns.map((b) =>
      `${b.panel}-${b.circuitType === 'central' ? 'C' : 'R'}${b.symbolIndex}`
    )
  )

  function toggle(sym: Symbol) {
    if (actionUsed || sym.panel !== activePanel) return
    socket.emit('engineer:markBreakdown', {
      roomId: room!.id,
      symbolIndex: sym.localIndex,
      panel: sym.panel,
      circuitType: sym.zone,
    })
  }

  return (
    <div className={styles.engineer}>
      <div className={styles.layout}>
        {/* Col 1: MiniMap + status + legend + repair */}
        <div className={styles.colLeft}>
          <MiniMap scenario={room.scenario} submarine={sub} size={160} estimate={estimate} />

          <section className={styles.statusPanel}>
            <h3>Status</h3>
            <div className={styles.statusItem}>
              {actionUsed
                ? '— Action used'
                : activePanel
                  ? `▶ Mark panel ${activePanel}`
                  : '● Awaiting move'}
            </div>
            {sub.engineer.radiationCount > 0 && (
              <div className={styles.radiationWarning}>
                ☢ RAD: {sub.engineer.radiationCount} / {TOTAL_RADIATION}
              </div>
            )}
          </section>

          <section className={styles.legendPanel}>
            <h3>Circuits</h3>
            {CIRCUITS.map((c) => (
              <div key={c.id} className={styles.legendRow}>
                <span className={styles.legendDot} style={{ background: c.color }} />
                <span style={{ color: c.color, fontSize: '0.65rem' }}>
                  {c.label}
                </span>
                <span className={styles.legendPanels} style={{ color: c.color }}>
                  {c.id === 0 ? 'S×3 + E' : c.id === 1 ? 'N×3 + E' : 'W×3 + E'}
                </span>
              </div>
            ))}
            <div className={styles.legendDivider} />
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: '#cc44ff' }} />
              <span style={{ color: '#cc44ff', fontSize: '0.65rem' }}>Radiation (reactor)</span>
            </div>
          </section>

          <section className={styles.repairPanel}>
            <h3>Repair Rules</h3>
            <p>All 4 in a circuit → auto-repairs</p>
            <p>Surface → clears all breakdowns</p>
            <p>All 4 ☢ symbols → 1 damage + reset</p>
          </section>
        </div>

        {/* Col 2: 4 panels in a row */}
        <div className={styles.board}>
          {PANELS.map((panel) => {
            const centralSyms = ALL_SYMBOLS.filter((s) => s.panel === panel && s.zone === 'central')
            const reactorSyms = ALL_SYMBOLS.filter((s) => s.panel === panel && s.zone === 'reactor')
            const isActive = panel === activePanel && !actionUsed

            return (
              <div
                key={panel}
                className={`${styles.panel} ${isActive ? styles.panelActive : ''}`}
              >
                <div className={styles.panelHeader}>
                  {panel}
                  {isActive && <span className={styles.markHint}>◀ mark</span>}
                </div>

                {/* Central circuits */}
                <div className={styles.centralSymbols}>
                  {centralSyms.map((sym) => {
                    const isBroken = brokenIds.has(sym.id)
                    const circuitColor = CIRCUITS[sym.circuitId!].color
                    const circuitComplete = CIRCUITS[sym.circuitId!].symbols.every((id) => brokenIds.has(id))

                    return (
                      <button
                        key={sym.id}
                        onClick={() => toggle(sym)}
                        className={`${styles.centralCell} ${isBroken ? styles.cellBroken : ''} ${isActive ? styles.cellActive : ''}`}
                        style={{ '--circuit-color': circuitColor } as React.CSSProperties}
                        title={`${TYPE_LABEL[sym.type]} — ${CIRCUITS[sym.circuitId!].label} circuit`}
                      >
                        <span
                          className={styles.cellType}
                          style={{
                            color: TYPE_COLORS[sym.type],
                            textDecoration: isBroken ? 'line-through' : 'none',
                            opacity: isBroken ? 0.5 : 1,
                          }}
                        >
                          {TYPE_LABEL[sym.type]}
                        </span>
                        {circuitComplete && !isBroken && (
                          <span className={styles.repairPing}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Reactor */}
                <div className={styles.zoneLabel}>Reactor</div>
                <div className={styles.reactorSymbols}>
                  {reactorSyms.map((sym) => {
                    const isBroken = brokenIds.has(sym.id)
                    return (
                      <button
                        key={sym.id}
                        onClick={() => toggle(sym)}
                        className={`${styles.reactorCell} ${isBroken ? styles.cellBroken : ''} ${isActive ? styles.cellActive : ''}`}
                        style={{ '--circuit-color': TYPE_COLORS[sym.type] } as React.CSSProperties}
                        title={TYPE_LABEL[sym.type]}
                      >
                        <span style={{
                          color: TYPE_COLORS[sym.type],
                          textDecoration: isBroken ? 'line-through' : 'none',
                          opacity: isBroken ? 0.5 : 1,
                        }}>
                          {TYPE_LABEL[sym.type]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
