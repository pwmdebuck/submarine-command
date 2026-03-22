import { MAPS } from '@submarine/shared'
import type { ScenarioId, SubmarineState } from '@submarine/shared'
import styles from './MiniMap.module.css'

interface MiniMapProps {
  scenario: ScenarioId
  submarine: SubmarineState
  size?: number
  estimate?: { row: number; col: number; age: number } | null
}

export function MiniMap({ scenario, submarine: sub, size = 150, estimate }: MiniMapProps) {
  const map = MAPS[scenario]
  const cellSize = size / 15

  const isIslandSet = new Set(map.islands.map((i) => `${i.row},${i.col}`))

  // Last 20 route points for fading trail
  const recentRoute = sub.route.slice(-20)

  return (
    <div className={styles.miniMap}>
      <div className={styles.label}>POSITION</div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        className={styles.svg}
        style={{ background: '#060f09', border: '1px solid #1a4a25' }}
      >
        {/* Grid lines */}
        {Array.from({ length: 16 }).map((_, i) => (
          <g key={i}>
            <line
              x1={i * cellSize} y1={0}
              x2={i * cellSize} y2={size}
              stroke="rgba(0,255,106,0.06)" strokeWidth="0.5"
            />
            <line
              x1={0} y1={i * cellSize}
              x2={size} y2={i * cellSize}
              stroke="rgba(0,255,106,0.06)" strokeWidth="0.5"
            />
          </g>
        ))}

        {/* Islands */}
        {map.islands.map((island) => (
          <rect
            key={`${island.row}-${island.col}`}
            x={island.col * cellSize}
            y={island.row * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#0e1a0a"
            stroke="#1a4a25"
            strokeWidth="0.5"
          />
        ))}

        {/* Route trail — fading opacity */}
        {recentRoute.length > 1 && recentRoute.map((point, i) => {
          if (i === 0) return null
          const prev = recentRoute[i - 1]
          const opacity = 0.15 + (i / recentRoute.length) * 0.85
          return (
            <line
              key={i}
              x1={prev.col * cellSize + cellSize / 2}
              y1={prev.row * cellSize + cellSize / 2}
              x2={point.col * cellSize + cellSize / 2}
              y2={point.row * cellSize + cellSize / 2}
              stroke="#00ff6a"
              strokeWidth="1.5"
              strokeOpacity={opacity}
            />
          )
        })}

        {/* Mines */}
        {sub.mines.map((mine) => (
          <text
            key={`${mine.row}-${mine.col}`}
            x={mine.col * cellSize + cellSize / 2}
            y={mine.row * cellSize + cellSize / 2 + 3}
            textAnchor="middle"
            fill="#ffaa00"
            fontSize={Math.max(6, cellSize * 0.6)}
            fontFamily="'Share Tech Mono', monospace"
          >M</text>
        ))}

        {/* Enemy estimate */}
        {estimate && (
          <g>
            <circle
              cx={estimate.col * cellSize + cellSize / 2}
              cy={estimate.row * cellSize + cellSize / 2}
              r={Math.max(3, cellSize * 0.4)}
              fill="#f97316"
              fillOpacity={0.25}
              stroke="#f97316"
              strokeWidth="1"
            />
            <text
              x={estimate.col * cellSize + cellSize / 2}
              y={estimate.row * cellSize + cellSize / 2 + 3}
              textAnchor="middle"
              fill="#f97316"
              fontSize={Math.max(5, cellSize * 0.45)}
              fontFamily="'Share Tech Mono', monospace"
            >{estimate.age}</text>
          </g>
        )}

        {/* Own position */}
        {sub.position && !isIslandSet.has(`${sub.position.row},${sub.position.col}`) && (
          <circle
            cx={sub.position.col * cellSize + cellSize / 2}
            cy={sub.position.row * cellSize + cellSize / 2}
            r={Math.max(3, cellSize * 0.35)}
            fill="#00ff6a"
            style={{ filter: 'drop-shadow(0 0 3px #00ff6a)' }}
          />
        )}
      </svg>
      {sub.position
        ? <div className={styles.coords}>{sub.position.row},{sub.position.col}</div>
        : <div className={styles.noPos}>NO FIX</div>
      }
    </div>
  )
}
