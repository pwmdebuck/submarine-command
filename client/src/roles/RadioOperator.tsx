import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import { MAPS } from '@submarine/shared'
import type { Direction } from '@submarine/shared'
import styles from './RadioOperator.module.css'

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0,  dy: -1 },
  S: { dx: 0,  dy:  1 },
  E: { dx: 1,  dy:  0 },
  W: { dx: -1, dy:  0 },
}

export function RadioOperator() {
  const { room, player } = useGameStore()
  const svgRef = useRef<SVGSVGElement>(null)

  // Tracking state — enemy route drawn on transparent overlay
  const [trackedPath, setTrackedPath] = useState<{ dx: number; dy: number }[]>([])
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  // Manual move log (radio operator's own entries)
  const [moveLog, setMoveLog] = useState<{ dir: Direction; turn: number }[]>([])
  const turnRef = useRef(0)

  // Incoming move flash — visible for 1 second, then must be manually plotted
  const [flashDir, setFlashDir] = useState<Direction | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estimate — RO clicks map to mark likely enemy position, shared with captain
  const [estimate, setEstimateState] = useState<{ row: number; col: number; age: number } | null>(null)
  const estimateRef = useRef<{ row: number; col: number; age: number } | null>(null)

  // Intel log (drone/sonar results)
  const [intelLog, setIntelLog] = useState<string[]>([])

  useEffect(() => {
    function onEnemyMove({ team, direction }: { team: string; direction: Direction }) {
      if (!player) return
      if (team === player.team) return  // only track enemy

      // Flash the direction for 1 second — radio operator must manually plot it
      setFlashDir(direction)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlashDir(null), 1000)
    }

    function onDroneResult({ inSector }: { inSector: boolean }) {
      setIntelLog((l) => [...l.slice(-19), `DRONE: enemy ${inSector ? 'IN' : 'NOT IN'} sector`])
    }

    function onSonarClues({ clue1, clue2 }: { clue1: string; clue2: string }) {
      setIntelLog((l) => [...l.slice(-19), `SONAR: "${clue1}" / "${clue2}"`])
    }

    socket.on('captain:moved', onEnemyMove)
    socket.on('drone:result', onDroneResult)
    socket.on('sonar:clues', onSonarClues)
    return () => {
      socket.off('captain:moved', onEnemyMove)
      socket.off('drone:result', onDroneResult)
      socket.off('sonar:clues', onSonarClues)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [player])

  if (!room || !player) return null

  const map = MAPS[room.scenario]
  const cellSize = 28
  const W = map.cols * cellSize
  const H = map.rows * cellSize

  // Build overlay path from tracked deltas, starting at center
  const startX = W / 2
  const startY = H / 2
  let curX = startX
  let curY = startY
  const pathPoints: { x: number; y: number }[] = [{ x: curX, y: curY }]
  for (const { dx, dy } of trackedPath) {
    curX += dx * cellSize
    curY += dy * cellSize
    pathPoints.push({ x: curX, y: curY })
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: overlayOffset.x,
      oy: overlayOffset.y,
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setOverlayOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy })
  }

  function onMouseUp() {
    setIsDragging(false)
  }

  function resetOverlay() {
    setTrackedPath([])
    setOverlayOffset({ x: 0, y: 0 })
    turnRef.current = 0
    setMoveLog([])
    clearEstimate()
  }

  function emitEstimate(est: { row: number; col: number; age: number } | null) {
    if (!room) return
    socket.emit('radioOp:estimate', { roomId: room.id, position: est ? { row: est.row, col: est.col } : null, age: est?.age ?? 0 })
  }

  function markEstimate(row: number, col: number) {
    const est = { row, col, age: 0 }
    estimateRef.current = est
    setEstimateState(est)
    emitEstimate(est)
  }

  function clearEstimate() {
    estimateRef.current = null
    setEstimateState(null)
    emitEstimate(null)
  }

  function plotMove(dir: Direction) {
    turnRef.current++
    setMoveLog((l) => [...l.slice(-49), { dir, turn: turnRef.current }])
    setTrackedPath((p) => [...p, DELTA[dir]])
    // Age the estimate with each plotted move
    if (estimateRef.current) {
      const aged = { ...estimateRef.current, age: estimateRef.current.age + 1 }
      estimateRef.current = aged
      setEstimateState(aged)
      emitEstimate(aged)
    }
  }

  const DIR_ARROW: Record<Direction, string> = { N: '▲', S: '▼', E: '▶', W: '◀' }

  return (
    <div className={styles.radioOp}>
      <h2>Radio Operator</h2>

      {/* Intercept flash — visible 1 second */}
      <div className={`${styles.interceptFlash} ${flashDir ? styles.interceptVisible : ''}`}>
        {flashDir && <>INTERCEPT: {DIR_ARROW[flashDir]} {flashDir}</>}
      </div>

      {/* Manual direction input */}
      <div className={styles.manualInput}>
        <span className={styles.manualLabel}>Plot move:</span>
        <div className={styles.dpad}>
          <div />
          <button onClick={() => plotMove('N')} className={styles.dpadBtn}>{DIR_ARROW.N}</button>
          <div />
          <button onClick={() => plotMove('W')} className={styles.dpadBtn}>{DIR_ARROW.W}</button>
          <div />
          <button onClick={() => plotMove('E')} className={styles.dpadBtn}>{DIR_ARROW.E}</button>
          <div />
          <button onClick={() => plotMove('S')} className={styles.dpadBtn}>{DIR_ARROW.S}</button>
          <div />
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapWrapper}>
          <p className={styles.hint}>
            Drag overlay to align route · Click map to mark enemy estimate
            {estimate !== null && (
              <> · <span className={styles.estimateAge}>estimate age: {estimate.age} moves</span>
              <button onClick={clearEstimate} className={styles.clearEstimateBtn}>✕</button></>
            )}
          </p>
          <div
            className={styles.mapContainer}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Base map */}
            <svg ref={svgRef} width={W} height={H} className={styles.baseMap}>
              {Array.from({ length: map.rows }).map((_, r) =>
                Array.from({ length: map.cols }).map((_, c) => {
                  const isIsland = map.islands.some((i) => i.row === r && i.col === c)
                  return (
                    <rect
                      key={`${r}-${c}`}
                      x={c * cellSize} y={r * cellSize}
                      width={cellSize} height={cellSize}
                      className={isIsland ? styles.cellIsland : styles.cellSea}
                      onClick={isIsland ? undefined : () => markEstimate(r, c)}
                    />
                  )
                })
              )}
              {/* Sector lines */}
              {[5, 10].map((v) => (
                <g key={v}>
                  <line x1={v * cellSize} y1={0} x2={v * cellSize} y2={H} className={styles.sectorLine} />
                  <line x1={0} y1={v * cellSize} x2={W} y2={v * cellSize} className={styles.sectorLine} />
                </g>
              ))}
              {/* Estimate marker */}
              {estimate && (
                <g className={styles.estimateMarker}>
                  <circle
                    cx={estimate.col * cellSize + cellSize / 2}
                    cy={estimate.row * cellSize + cellSize / 2}
                    r={9}
                    className={styles.estimateDot}
                  />
                  <text
                    x={estimate.col * cellSize + cellSize / 2}
                    y={estimate.row * cellSize - 4}
                    textAnchor="middle"
                    className={styles.estimateAgeLabel}
                  >{estimate.age}</text>
                </g>
              )}
            </svg>

            {/* Transparent overlay — draggable */}
            <svg
              width={W} height={H}
              className={`${styles.overlay} ${isDragging ? styles.dragging : ''}`}
              style={{ transform: `translate(${overlayOffset.x}px, ${overlayOffset.y}px)` }}
              onMouseDown={onMouseDown}
            >
              {/* Tracked route */}
              {pathPoints.length > 1 && (
                <polyline
                  points={pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  className={styles.trackedRoute}
                />
              )}
              {/* Current estimated position dot */}
              {pathPoints.length > 0 && (
                <circle
                  cx={pathPoints[pathPoints.length - 1].x}
                  cy={pathPoints[pathPoints.length - 1].y}
                  r={7}
                  className={styles.enemyDot}
                />
              )}
            </svg>
          </div>
        </div>

        <div className={styles.sidebar}>
          <section className={styles.logSection}>
            <h3>Enemy Moves <button onClick={resetOverlay} className={styles.resetBtn}>Reset</button></h3>
            <div className={styles.moveLog}>
              {moveLog.length === 0 && <span className={styles.empty}>Listening…</span>}
              {moveLog.map(({ dir, turn }) => (
                <div key={turn} className={styles.logEntry}>
                  <span className={styles.turnNum}>#{turn}</span>
                  <span className={styles.arrow}>{DIR_ARROW[dir]}</span>
                  <span>{dir}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.intelSection}>
            <h3>Intel</h3>
            <div className={styles.intelLog}>
              {intelLog.length === 0 && <span className={styles.empty}>No intel yet…</span>}
              {intelLog.map((entry, i) => (
                <div key={i} className={styles.intelEntry}>{entry}</div>
              ))}
            </div>
          </section>

          <section className={styles.notes}>
            <h3>Notes</h3>
            <textarea
              className={styles.notepad}
              placeholder="Sector guesses, landmarks, observations…"
              rows={6}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
