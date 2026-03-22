import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import { MAPS } from '@submarine/shared'
import type { Coord, Direction, SystemName } from '@submarine/shared'
import { CircuitBoard } from '../components/CircuitBoard'
import styles from './Captain.module.css'

const DIR_LABELS: Record<Direction, string> = { N: '▲ N', E: '▶ E', S: '▼ S', W: '◀ W' }

export function Captain() {
  const { room, player, godMode } = useGameStore()
  const [log, setLog] = useState<string[]>([])
  const [droneSectorInput, setDroneSectorInput] = useState<number | null>(null)
  const [mineMode, setMineMode] = useState(false)
  const [torpedoMode, setTorpedoMode] = useState(false)
  const [showCircuits, setShowCircuits] = useState(true)
  const [lastDroneSector, setLastDroneSector] = useState<number | null>(null)
  const [roEstimate, setRoEstimate] = useState<{ row: number; col: number; age: number } | null>(null)

  useEffect(() => {
    socket.on('captain:moved', ({ direction }) => addLog(`HEAD ${direction}`))
    socket.on('drone:result', ({ inSector }) =>
      setLastDroneSector((s) => {
        addLog(`DRONE: enemy ${inSector ? 'IN' : 'NOT IN'} sector ${s ?? '?'}`)
        return null
      })
    )
    socket.on('sonar:clues', ({ clue1, clue2 }) => addLog(`SONAR: "${clue1}" / "${clue2}"`))
    socket.on('combat:resolved', ({ result, newDamage }) => addLog(`HIT RESULT: ${result.toUpperCase()} — damage now ${newDamage}`))
    socket.on('radioOp:estimate', ({ position, age }) =>
      setRoEstimate(position ? { ...position, age } : null)
    )
    socket.on('system:activated', ({ team: t, system: sys, params }) => {
      if (sys !== 'scenario') return
      const dmg = (params as Record<string, unknown>)?.newDamage as number
      const ownTeam = useGameStore.getState().player?.team
      if (t === ownTeam) {
        addLog(`HEALING — damage now ${dmg}/4`)
      } else {
        addLog(`Enemy healed — damage now ${dmg}/4`)
      }
    })
    return () => {
      socket.off('captain:moved')
      socket.off('drone:result')
      socket.off('sonar:clues')
      socket.off('combat:resolved')
      socket.off('radioOp:estimate')
      socket.off('system:activated')
    }
  }, [])

  if (!room || !player) return null

  const map = MAPS[room.scenario]
  const sub = room.teams[player.team].submarine
  const systems = sub.systems
  const canMove = sub.pendingTasks.engineerDone && sub.pendingTasks.firstMateDone

  const SYSTEM_COLOR: Partial<Record<SystemName, string>> = {
    mine: '#ef4444', torpedo: '#ef4444',
    drone: '#22c55e', sonar: '#22c55e',
    silence: '#eab308', scenario: '#eab308',
  }
  const SYSTEM_LABEL: Partial<Record<SystemName, string>> = {
    scenario: 'heal',
  }

  const CENTRAL_TYPES_BY_PANEL: Record<string, string[]> = {
    W: ['mine-torpedo',     'silence-scenario', 'drone-sonar'     ],
    N: ['drone-sonar',      'mine-torpedo',     'silence-scenario'],
    S: ['silence-scenario', 'drone-sonar',      'mine-torpedo'    ],
    E: ['mine-torpedo',     'drone-sonar',      'silence-scenario'],
  }
  const REACTOR_TYPES_BY_PANEL: Record<string, string[]> = {
    W: ['drone-sonar', 'radiation',    'radiation'       ],
    N: ['drone-sonar', 'mine-torpedo', 'radiation'       ],
    S: ['mine-torpedo','radiation',    'silence-scenario'],
    E: ['radiation',   'drone-sonar',  'radiation'       ],
  }
  const SYSTEM_SYMBOL: Partial<Record<SystemName, string>> = {
    mine: 'mine-torpedo', torpedo: 'mine-torpedo',
    drone: 'drone-sonar', sonar: 'drone-sonar',
    silence: 'silence-scenario', scenario: 'silence-scenario',
  }
  function isSystemLocked(system: SystemName): boolean {
    const symbolType = SYSTEM_SYMBOL[system]
    if (!symbolType) return false
    return sub.engineer.breakdowns.some((b) => {
      const t = b.circuitType === 'central'
        ? CENTRAL_TYPES_BY_PANEL[b.panel]?.[b.symbolIndex]
        : REACTOR_TYPES_BY_PANEL[b.panel]?.[b.symbolIndex]
      return t === symbolType
    })
  }

  function addLog(msg: string) {
    setLog((l) => [...l.slice(-29), msg])
  }

  function move(dir: Direction) {
    if (!godMode && !canMove) return
    socket.emit('captain:move', { roomId: room!.id, direction: dir })
  }

  function surface() {
    socket.emit('captain:surface', { roomId: room!.id })
    addLog('SURFACE')
  }

  function activateSystem(system: SystemName) {
    if (system === 'drone') {
      setDroneSectorInput(1)
      return
    }
    if (system === 'mine') {
      setMineMode(true)
      return
    }
    if (system === 'torpedo') {
      setTorpedoMode(true)
      return
    }
    if (system === 'scenario') {
      socket.emit('system:activate', { roomId: room!.id, system })
      return  // log comes from system:activated event
    }
    socket.emit('system:activate', { roomId: room!.id, system })
    addLog(`ACTIVATE ${system.toUpperCase()}`)
  }

  function fireTorpedo(coord: Coord) {
    socket.emit('system:activate', { roomId: room!.id, system: 'torpedo', params: { position: coord } })
    addLog(`TORPEDO → ${coord.row},${coord.col}`)
    setTorpedoMode(false)
  }

  function placeMine(coord: Coord) {
    socket.emit('system:activate', { roomId: room!.id, system: 'mine', params: { position: coord } })
    addLog(`MINE LAID @ ${coord.row},${coord.col}`)
    setMineMode(false)
  }

  function fireDrone() {
    if (droneSectorInput === null) return
    setLastDroneSector(droneSectorInput)
    socket.emit('system:activate', { roomId: room!.id, system: 'drone', params: { sector: droneSectorInput } })
    addLog(`DRONE → sector ${droneSectorInput}`)
    setDroneSectorInput(null)
  }

  function setStart(coord: Coord) {
    if (sub.position) return
    socket.emit('captain:setStart', { roomId: room!.id, position: coord })
    addLog(`START: ${coord.row},${coord.col}`)
  }

  function detonateMine(coord: Coord) {
    socket.emit('captain:detonateMine', { roomId: room!.id, position: coord })
    addLog(`MINE DETONATED @ ${coord.row},${coord.col}`)
  }

  const cellSize = 32
  const cols = map.cols
  const rows = map.rows

  return (
    <div className={styles.captain}>
      {mineMode && (
        <div className={styles.queryModal}>
          <h3>MINE — Select Drop Zone</h3>
          <p>Click an adjacent cell (including diagonals). Cannot place on your route.</p>
          <div className={styles.queryActions}>
            <button onClick={() => setMineMode(false)} className={styles.noBtn}>CANCEL</button>
          </div>
        </div>
      )}

      {torpedoMode && (
        <div className={styles.queryModal}>
          <h3>TORPEDO — Select Target</h3>
          <p>Click a cell within 4 city-block distance. Warning: blasts within 1 cell damage own sub.</p>
          <div className={styles.queryActions}>
            <button onClick={() => setTorpedoMode(false)} className={styles.noBtn}>CANCEL</button>
          </div>
        </div>
      )}

      {droneSectorInput !== null && (
        <div className={styles.queryModal}>
          <h3>DRONE — Select Sector</h3>
          <p>Sectors 1–9 (top-left to bottom-right, 3×3 grid)</p>
          <div className={styles.sectorGrid}>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((s) => (
              <button
                key={s}
                onClick={() => setDroneSectorInput(s)}
                className={droneSectorInput === s ? styles.sectorSelected : ''}
              >
                {s}
              </button>
            ))}
          </div>
          <div className={styles.queryActions}>
            <button onClick={fireDrone} className={styles.yesBtn}>FIRE DRONE</button>
            <button onClick={() => setDroneSectorInput(null)} className={styles.noBtn}>CANCEL</button>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* Col 1: Navigation stats + systems */}
        <div className={styles.colLeft}>
          <section className={styles.navPanel}>
            <h3>Navigation</h3>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>POSITION</span>
              <span className={styles.statValue}>
                {sub.position ? `${sub.position.row},${sub.position.col}` : 'NO FIX'}
              </span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>HEADING</span>
              <span className={styles.statValue}>{sub.lastMoveDirection ?? '—'}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>ROUTE</span>
              <span className={styles.statValue}>{sub.route.length} moves</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>DAMAGE</span>
              <span className={`${styles.statValue} ${sub.damage > 2 ? styles.danger : sub.damage > 0 ? styles.warn : ''}`}>
                {sub.damage}/4
              </span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>MINES LAID</span>
              <span className={styles.statValue}>{sub.mines.length}</span>
            </div>
            {sub.silentMovesRemaining > 0 && (
              <div className={styles.silentBadge}>SILENT ×{sub.silentMovesRemaining}</div>
            )}
          </section>

          <section className={styles.systemsSection}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Systems
              <button
                onClick={() => setShowCircuits((v) => !v)}
                style={{ fontSize: '0.55rem', padding: '2px 6px', letterSpacing: '0.06em' }}
              >
                {showCircuits ? '▲ CIRCUITS' : '▼ CIRCUITS'}
              </button>
            </h3>
            {(Object.keys(systems) as SystemName[]).map((sys) => {
              const g = systems[sys]
              const color = SYSTEM_COLOR[sys]
              const locked = isSystemLocked(sys)
              return (
                <div key={sys} className={`${styles.systemRow} ${locked ? styles.systemRowLocked : ''}`}>
                  <span className={styles.sysName} style={{ color }}>{SYSTEM_LABEL[sys] ?? sys}</span>
                  {sys === 'scenario' ? (
                    <span className={styles.gauge} style={{ flexDirection: 'column', gap: 2 }}>
                      {[0, 1].map((row) => (
                        <span key={row} style={{ display: 'flex', gap: 2 }}>
                          {Array.from({ length: 6 }).map((_, i) => {
                            const idx = row * 6 + i
                            return (
                              <span key={idx} style={{ color: idx < g.filled ? color : undefined }} className={idx < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}>●</span>
                            )
                          })}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className={styles.gauge}>
                      {Array.from({ length: g.total }).map((_, i) => (
                        <span key={i} style={{ color: i < g.filled ? color : undefined }} className={i < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}>●</span>
                      ))}
                    </span>
                  )}
                  {locked && <span className={styles.lockedBadge}>BLOCKED</span>}
                  <button
                    onClick={() => activateSystem(sys)}
                    disabled={!godMode && (!g.ready || locked)}
                    className={g.ready && !locked ? styles.readyBtn : ''}
                    style={g.ready && !locked ? { borderColor: color, color } : undefined}
                  >
                    {g.ready ? (locked ? '—' : 'FIRE') : '—'}
                  </button>
                </div>
              )
            })}
          </section>
        </div>

        {/* Col 2: Tactical map */}
        <div className={styles.mapSection}>
          <svg
            width={cols * cellSize + cellSize}
            height={rows * cellSize + cellSize}
            className={styles.map}
          >
            {/* Column labels (0–14) */}
            {Array.from({ length: cols }).map((_, c) => (
              <text
                key={`col-${c}`}
                x={cellSize + c * cellSize + cellSize / 2}
                y={cellSize / 2 + 4}
                textAnchor="middle"
                className={styles.axisLabel}
              >{c}</text>
            ))}

            {/* Row labels (0–14) */}
            {Array.from({ length: rows }).map((_, r) => (
              <text
                key={`row-${r}`}
                x={cellSize / 2}
                y={cellSize + r * cellSize + cellSize / 2 + 4}
                textAnchor="middle"
                className={styles.axisLabel}
              >{r}</text>
            ))}

            <g transform={`translate(${cellSize}, ${cellSize})`}>
              {/* Sector number overlays (1–9) */}
              {Array.from({ length: 9 }).map((_, s) => {
                const sc = (s % 3) * 5 + 2
                const sr = Math.floor(s / 3) * 5 + 2
                return (
                  <text
                    key={`sector-${s + 1}`}
                    x={sc * cellSize + cellSize / 2}
                    y={sr * cellSize + cellSize / 2 + 16}
                    textAnchor="middle"
                    className={styles.sectorLabel}
                  >{s + 1}</text>
                )
              })}

              {Array.from({ length: rows }).map((_, r) =>
                Array.from({ length: cols }).map((_, c) => {
                  const isIsland = map.islands.some((i) => i.row === r && i.col === c)
                  const isMine = sub.mines.some((m) => m.row === r && m.col === c)
                  const isPos = sub.position?.row === r && sub.position?.col === c
                  const onRoute = sub.route.some((p) => p.row === r && p.col === c)
                  const dr = sub.position ? Math.abs(r - sub.position.row) : 99
                  const dc = sub.position ? Math.abs(c - sub.position.col) : 99
                  const isMinePlaceable = mineMode && !isIsland && !onRoute && !isPos && dr <= 1 && dc <= 1 && (dr + dc > 0)
                  const manhattanDist = dr + dc
                  const isTorpedoTarget = torpedoMode && !isIsland && !isPos && manhattanDist <= 4 && manhattanDist > 0
                  function handleClick() {
                    if (torpedoMode) { if (isTorpedoTarget) fireTorpedo({ row: r, col: c }); return }
                    if (mineMode) { if (isMinePlaceable) placeMine({ row: r, col: c }); return }
                    if (isMine) detonateMine({ row: r, col: c })
                    else setStart({ row: r, col: c })
                  }
                  return (
                    <g key={`${r}-${c}`} onClick={handleClick}>
                      <rect
                        x={c * cellSize}
                        y={r * cellSize}
                        width={cellSize}
                        height={cellSize}
                        className={
                          isTorpedoTarget ? styles.cellTorpedoTarget
                          : isMinePlaceable ? styles.cellMinePlaceable
                          : isIsland ? styles.cellIsland
                          : onRoute ? styles.cellRoute
                          : styles.cellSea
                        }
                      />
                      {isMine && (
                        <text
                          x={c * cellSize + cellSize / 2}
                          y={r * cellSize + cellSize / 2 + 5}
                          textAnchor="middle"
                          className={styles.mineLabel}
                        >💣</text>
                      )}
                      {isPos && (
                        <circle
                          cx={c * cellSize + cellSize / 2}
                          cy={r * cellSize + cellSize / 2}
                          r={8}
                          className={styles.subCircle}
                        />
                      )}
                    </g>
                  )
                })
              )}

              {sub.route.length > 1 && (
                <polyline
                  points={sub.route.map((p) => `${p.col * cellSize + cellSize / 2},${p.row * cellSize + cellSize / 2}`).join(' ')}
                  className={styles.routeLine}
                />
              )}

              {roEstimate && (
                <g>
                  <circle
                    cx={roEstimate.col * cellSize + cellSize / 2}
                    cy={roEstimate.row * cellSize + cellSize / 2}
                    r={10}
                    className={styles.estimateDot}
                  />
                  <text
                    x={roEstimate.col * cellSize + cellSize / 2}
                    y={roEstimate.row * cellSize - 4}
                    textAnchor="middle"
                    className={styles.estimateAgeLabel}
                  >{roEstimate.age}</text>
                </g>
              )}
            </g>
          </svg>
        </div>

        {/* Col 3: D-pad + log */}
        <div className={styles.colRight}>
          <section className={styles.dirPad}>
            <h3>Course</h3>
            {!canMove && (
              <div className={styles.waitingStatus}>
                WAIT:{!sub.pendingTasks.engineerDone && ' ENG'}{!sub.pendingTasks.firstMateDone && ' MATE'}
              </div>
            )}
            <div className={styles.dpad}>
              <div />
              <button onClick={() => move('N')} disabled={!godMode && !canMove}>{DIR_LABELS.N}</button>
              <div />
              <button onClick={() => move('W')} disabled={!godMode && !canMove}>{DIR_LABELS.W}</button>
              <button onClick={surface} className={styles.surfaceBtn}>SURF</button>
              <button onClick={() => move('E')} disabled={!godMode && !canMove}>{DIR_LABELS.E}</button>
              <div />
              <button onClick={() => move('S')} disabled={!godMode && !canMove}>{DIR_LABELS.S}</button>
              <div />
            </div>
          </section>

          <section className={styles.logSection}>
            <h3>Log</h3>
            <div className={styles.log}>
              {log.map((l, i) => <div key={i}>&gt; {l}</div>)}
            </div>
          </section>
        </div>
      </div>

      {showCircuits && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <CircuitBoard
            breakdowns={sub.engineer.breakdowns}
            radiationCount={sub.engineer.radiationCount}
          />
        </div>
      )}
    </div>
  )
}
