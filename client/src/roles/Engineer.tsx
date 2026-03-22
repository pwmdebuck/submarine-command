import { useGameStore } from '../store'
import { socket } from '../socket'
import styles from './Engineer.module.css'

type Panel = 'W' | 'N' | 'S' | 'E'
type SymbolType = 'mine-torpedo' | 'drone-sonar' | 'silence-scenario' | 'radiation'

interface Symbol {
  panel: Panel
  zone: 'central' | 'reactor'
  type: SymbolType
  localIndex: number  // 0-based index within panel+zone
  id: string          // unique key for rendering
}

function makeSymbols(): Symbol[] {
  const panels: Panel[] = ['W', 'N', 'S', 'E']
  const centralTypes: SymbolType[] = ['mine-torpedo', 'drone-sonar', 'silence-scenario', 'mine-torpedo']
  const reactorTypes: SymbolType[] = ['drone-sonar', 'silence-scenario', 'radiation']
  const syms: Symbol[] = []

  panels.forEach((panel) => {
    centralTypes.forEach((type, i) => {
      syms.push({ panel, zone: 'central', type, localIndex: i, id: `${panel}-C${i}` })
    })
    reactorTypes.forEach((type, i) => {
      syms.push({ panel, zone: 'reactor', type, localIndex: i, id: `${panel}-R${i}` })
    })
  })

  return syms
}

const ALL_SYMBOLS = makeSymbols()
const PANELS: Panel[] = ['W', 'N', 'S', 'E']

const TYPE_COLORS: Record<SymbolType, string> = {
  'mine-torpedo':       '#ef4444',
  'drone-sonar':        '#22c55e',
  'silence-scenario':   '#eab308',
  'radiation':          '#a855f7',
}

const TYPE_LABEL: Record<SymbolType, string> = {
  'mine-torpedo':     'M/T',
  'drone-sonar':      'D/S',
  'silence-scenario': 'SL/SC',
  'radiation':        '☢',
}

export function Engineer() {
  const { room, player } = useGameStore()

  if (!room || !player) return null

  const sub = room.teams[player.team].submarine
  const actionUsed = sub.pendingTasks.engineerDone
  const activePanel = sub.lastMoveDirection  // null means no move yet / waiting

  // Derive broken set from server state
  const brokenIds = new Set(
    sub.engineer.breakdowns.map((b) => `${b.panel}-${b.circuitType === 'central' ? 'C' : 'R'}${b.symbolIndex}`)
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

  function checkCircuit(panel: Panel, type: SymbolType) {
    const group = ALL_SYMBOLS.filter(
      (s) => s.panel === panel && s.zone === 'central' && s.type === type
    )
    return group.every((s) => brokenIds.has(s.id))
  }

  function isPanelBroken(panel: Panel) {
    const panelSyms = ALL_SYMBOLS.filter((s) => s.panel === panel)
    return panelSyms.every((s) => brokenIds.has(s.id))
  }

  return (
    <div className={styles.engineer}>
      <h2>Engineer</h2>

      <div className={styles.legend}>
        {(Object.entries(TYPE_COLORS) as [SymbolType, string][]).map(([type, color]) => (
          <span key={type} className={styles.legendItem} style={{ color }}>
            ● {TYPE_LABEL[type]}
          </span>
        ))}
        <span className={styles.legendHint}>
          {actionUsed
            ? 'Action used — wait for next move'
            : activePanel
              ? `Mark one symbol on panel ${activePanel}`
              : 'Waiting for captain to move'}
        </span>
      </div>

      {sub.engineer.radiationCount > 0 && (
        <div className={styles.radiationWarning}>
          ☢ Radiation: {sub.engineer.radiationCount} / 4
        </div>
      )}

      <div className={styles.board}>
        {PANELS.map((panel) => {
          const centralSyms = ALL_SYMBOLS.filter((s) => s.panel === panel && s.zone === 'central')
          const reactorSyms = ALL_SYMBOLS.filter((s) => s.panel === panel && s.zone === 'reactor')
          const panelBroken = isPanelBroken(panel)
          const isActive = panel === activePanel && !actionUsed
          const isInactive = activePanel !== null && panel !== activePanel

          return (
            <div
              key={panel}
              className={`${styles.panel} ${panelBroken ? styles.panelBroken : ''} ${isActive ? styles.panelActive : ''} ${isInactive ? styles.panelInactive : ''}`}
            >
              <div className={styles.panelHeader}>{panel}{isActive && ' ◀ MARK HERE'}</div>

              <div className={styles.zone}>
                <div className={styles.zoneLabel}>Central</div>
                <div className={styles.symbols}>
                  {centralSyms.map((sym) => {
                    const isBroken = brokenIds.has(sym.id)
                    const disabled = actionUsed || sym.panel !== activePanel
                    return (
                      <button
                        key={sym.id}
                        onClick={() => toggle(sym)}
                        disabled={disabled}
                        className={`${styles.symbol} ${isBroken ? styles.symbolBroken : ''}`}
                        style={{ borderColor: isBroken ? '#ef4444' : TYPE_COLORS[sym.type] }}
                        title={`${sym.type} (${sym.zone})`}
                      >
                        <span style={{ color: isBroken ? '#ef4444' : TYPE_COLORS[sym.type] }}>
                          {isBroken ? '✕' : TYPE_LABEL[sym.type]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={styles.zone}>
                <div className={styles.zoneLabel}>Reactor</div>
                <div className={styles.symbols}>
                  {reactorSyms.map((sym) => {
                    const isBroken = brokenIds.has(sym.id)
                    const disabled = actionUsed || sym.panel !== activePanel
                    return (
                      <button
                        key={sym.id}
                        onClick={() => toggle(sym)}
                        disabled={disabled}
                        className={`${styles.symbol} ${isBroken ? styles.symbolBroken : ''}`}
                        style={{ borderColor: isBroken ? '#ef4444' : TYPE_COLORS[sym.type] }}
                        title={sym.type}
                      >
                        <span style={{ color: isBroken ? '#ef4444' : TYPE_COLORS[sym.type] }}>
                          {isBroken ? '✕' : TYPE_LABEL[sym.type]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {panelBroken && (
                <div className={styles.panelAlert}>AREA BREAKDOWN — DAMAGE!</div>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.repair}>
        <h3>Repair Notes</h3>
        <p>Complete all 4 symbols on a Central circuit → auto-repairs</p>
        <p>Surface → clears all breakdowns</p>
        <p>All 4 radiation symbols crossed → 1 damage + full reset</p>
      </div>
    </div>
  )
}
