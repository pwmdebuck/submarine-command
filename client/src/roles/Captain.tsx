import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import { MAPS } from '@submarine/shared'
import type { Coord, Direction, SystemName } from '@submarine/shared'
import styles from './Captain.module.css'

const DIR_LABELS: Record<Direction, string> = { N: '▲ North', E: '▶ East', S: '▼ South', W: '◀ West' }

export function Captain() {
  const { room, player } = useGameStore()
  const [log, setLog] = useState<string[]>([])
  const [droneSectorInput, setDroneSectorInput] = useState<number | null>(null)
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
    return () => {
      socket.off('captain:moved')
      socket.off('drone:result')
      socket.off('sonar:clues')
      socket.off('combat:resolved')
      socket.off('radioOp:estimate')
    }
  }, [])

  if (!room || !player) return null

  const map = MAPS[room.scenario]
  const sub = room.teams[player.team].submarine
  const systems = sub.systems
  const canMove = sub.pendingTasks.engineerDone && sub.pendingTasks.firstMateDone

  const CENTRAL_TYPES = ['mine-torpedo', 'drone-sonar', 'silence-scenario', 'mine-torpedo']
  const REACTOR_TYPES = ['drone-sonar', 'silence-scenario', 'radiation']
  const SYSTEM_SYMBOL: Partial<Record<SystemName, string>> = {
    mine: 'mine-torpedo', torpedo: 'mine-torpedo',
    drone: 'drone-sonar', sonar: 'drone-sonar',
    silence: 'silence-scenario', scenario: 'silence-scenario',
  }
  function isSystemLocked(system: SystemName): boolean {
    const symbolType = SYSTEM_SYMBOL[system]
    if (!symbolType) return false
    return sub.engineer.breakdowns.some((b) => {
      const t = b.circuitType === 'central' ? CENTRAL_TYPES[b.symbolIndex] : REACTOR_TYPES[b.symbolIndex]
      return t === symbolType
    })
  }

  function addLog(msg: string) {
    setLog((l) => [...l.slice(-29), msg])
  }

  function move(dir: Direction) {
    if (!canMove) return
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
    socket.emit('system:activate', { roomId: room!.id, system })
    addLog(`ACTIVATE ${system.toUpperCase()}`)
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

  const cellSize = 32
  const cols = map.cols
  const rows = map.rows

  return (
    <div className={styles.captain}>
      <h2>Captain</h2>

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
        {/* Map */}
        <div className={styles.mapSection}>
          <svg
            width={cols * cellSize}
            height={rows * cellSize}
            className={styles.map}
          >
            {/* Grid cells */}
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: cols }).map((_, c) => {
                const isIsland = map.islands.some((i) => i.row === r && i.col === c)
                const isMine = sub.mines.some((m) => m.row === r && m.col === c)
                const isPos = sub.position?.row === r && sub.position?.col === c
                const onRoute = sub.route.some((p) => p.row === r && p.col === c)
                return (
                  <g key={`${r}-${c}`} onClick={() => setStart({ row: r, col: c })}>
                    <rect
                      x={c * cellSize}
                      y={r * cellSize}
                      width={cellSize}
                      height={cellSize}
                      className={
                        isIsland ? styles.cellIsland
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
                      >M</text>
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

            {/* Route path */}
            {sub.route.length > 1 && (
              <polyline
                points={sub.route.map((p) => `${p.col * cellSize + cellSize / 2},${p.row * cellSize + cellSize / 2}`).join(' ')}
                className={styles.routeLine}
              />
            )}

            {/* Radio operator estimate */}
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
          </svg>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <section className={styles.dirPad}>
            <h3>Course</h3>
            {!canMove && (
              <div className={styles.waitingStatus}>
                WAITING:{!sub.pendingTasks.engineerDone && ' Engineer'}{!sub.pendingTasks.firstMateDone && ' First Mate'}
              </div>
            )}
            <div className={styles.dpad}>
              <div />
              <button onClick={() => move('N')} disabled={!canMove}>{DIR_LABELS.N}</button>
              <div />
              <button onClick={() => move('W')} disabled={!canMove}>{DIR_LABELS.W}</button>
              <button onClick={surface} className={styles.surfaceBtn}>SURFACE</button>
              <button onClick={() => move('E')} disabled={!canMove}>{DIR_LABELS.E}</button>
              <div />
              <button onClick={() => move('S')} disabled={!canMove}>{DIR_LABELS.S}</button>
              <div />
            </div>
          </section>

          <section className={styles.systemsSection}>
            <h3>Systems {sub.silentMovesRemaining > 0 && <span className={styles.silentBadge}>SILENT ×{sub.silentMovesRemaining}</span>}</h3>
            {(Object.keys(systems) as SystemName[]).map((sys) => {
              const g = systems[sys]
              return (
                <div key={sys} className={styles.systemRow}>
                  <span className={styles.sysName}>{sys}</span>
                  <span className={styles.gauge}>
                    {Array.from({ length: g.total }).map((_, i) => (
                      <span key={i} className={i < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}>●</span>
                    ))}
                  </span>
                  <button
                    onClick={() => activateSystem(sys)}
                    disabled={!g.ready || isSystemLocked(sys)}
                    className={g.ready && !isSystemLocked(sys) ? styles.readyBtn : ''}
                  >
                    {g.ready ? (isSystemLocked(sys) ? 'LOCKED' : 'FIRE') : '—'}
                  </button>
                </div>
              )
            })}
          </section>

          <section className={styles.logSection}>
            <h3>Log</h3>
            <div className={styles.log}>
              {log.map((l, i) => <div key={i}>&gt; {l}</div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
