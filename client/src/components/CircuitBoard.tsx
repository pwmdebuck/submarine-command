import type { BreakdownCell } from '@submarine/shared'
import styles from '../roles/Engineer.module.css'

type Panel = 'W' | 'N' | 'S' | 'E'
type SymbolType = 'mine-torpedo' | 'drone-sonar' | 'silence-scenario' | 'radiation'

const CENTRAL_TYPES_BY_PANEL: Record<Panel, SymbolType[]> = {
  'W': ['mine-torpedo',     'silence-scenario', 'drone-sonar'     ],
  'N': ['drone-sonar',      'mine-torpedo',     'silence-scenario'],
  'S': ['silence-scenario', 'drone-sonar',      'mine-torpedo'    ],
  'E': ['mine-torpedo',     'drone-sonar',      'silence-scenario'],
}

const REACTOR_TYPES_BY_PANEL: Record<Panel, SymbolType[]> = {
  'W': ['drone-sonar', 'radiation',    'radiation'       ],
  'N': ['drone-sonar', 'mine-torpedo', 'radiation'       ],
  'S': ['mine-torpedo','radiation',    'silence-scenario'],
  'E': ['radiation',   'drone-sonar',  'radiation'       ],
}

const TOTAL_RADIATION = (Object.values(REACTOR_TYPES_BY_PANEL) as SymbolType[][])
  .flat().filter((t) => t === 'radiation').length

const PANELS: Panel[] = ['W', 'N', 'S', 'E']

const CIRCUITS: { id: 0|1|2; color: string; label: string; symbols: string[] }[] = [
  { id: 0, color: '#ff6633', label: 'Orange', symbols: ['S-C0', 'S-C1', 'S-C2', 'E-C0'] },
  { id: 1, color: '#aaaaaa', label: 'Grey',   symbols: ['N-C0', 'N-C1', 'N-C2', 'E-C1'] },
  { id: 2, color: '#ffcc00', label: 'Yellow', symbols: ['W-C0', 'W-C1', 'W-C2', 'E-C2'] },
]

function getCircuitId(panel: Panel, localIndex: number): 0|1|2 {
  if (panel === 'E') return localIndex as 0|1|2
  if (panel === 'W') return 2
  if (panel === 'N') return 1
  return 0
}

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

interface Props {
  breakdowns: BreakdownCell[]
  radiationCount: number
}

export function CircuitBoard({ breakdowns, radiationCount }: Props) {
  const brokenIds = new Set(
    breakdowns.map((b) => `${b.panel}-${b.circuitType === 'central' ? 'C' : 'R'}${b.symbolIndex}`)
  )

  return (
    <div>
      {radiationCount > 0 && (
        <div className={styles.radiationWarning} style={{ marginBottom: 8 }}>
          ☢ RAD: {radiationCount} / {TOTAL_RADIATION}
        </div>
      )}
      <div className={styles.board}>
        {PANELS.map((panel) => (
          <div key={panel} className={styles.panel}>
            <div className={styles.panelHeader}>{panel}</div>

            <div className={styles.centralSymbols}>
              {CENTRAL_TYPES_BY_PANEL[panel].map((type, i) => {
                const id = `${panel}-C${i}`
                const isBroken = brokenIds.has(id)
                const circuitId = getCircuitId(panel, i)
                const circuitColor = CIRCUITS[circuitId].color
                const circuitComplete = CIRCUITS[circuitId].symbols.every((s) => brokenIds.has(s))
                return (
                  <div
                    key={id}
                    className={`${styles.centralCell} ${isBroken ? styles.cellBroken : ''}`}
                    style={{ '--circuit-color': circuitColor } as React.CSSProperties}
                    title={`${TYPE_LABEL[type as SymbolType]} — ${CIRCUITS[circuitId].label} circuit`}
                  >
                    <span
                      className={styles.cellType}
                      style={{
                        color: TYPE_COLORS[type as SymbolType],
                        textDecoration: isBroken ? 'line-through' : 'none',
                        opacity: isBroken ? 0.5 : 1,
                      }}
                    >
                      {TYPE_LABEL[type as SymbolType]}
                    </span>
                    {circuitComplete && !isBroken && (
                      <span className={styles.repairPing}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className={styles.zoneLabel}>Reactor</div>
            <div className={styles.reactorSymbols}>
              {REACTOR_TYPES_BY_PANEL[panel].map((type, i) => {
                const id = `${panel}-R${i}`
                const isBroken = brokenIds.has(id)
                return (
                  <div
                    key={id}
                    className={`${styles.reactorCell} ${isBroken ? styles.cellBroken : ''}`}
                    style={{ '--circuit-color': TYPE_COLORS[type as SymbolType] } as React.CSSProperties}
                    title={TYPE_LABEL[type as SymbolType]}
                  >
                    <span style={{
                      color: TYPE_COLORS[type as SymbolType],
                      textDecoration: isBroken ? 'line-through' : 'none',
                      opacity: isBroken ? 0.5 : 1,
                    }}>
                      {TYPE_LABEL[type as SymbolType]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
