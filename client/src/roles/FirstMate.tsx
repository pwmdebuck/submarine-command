import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import type { SystemName } from '@submarine/shared'
import { MiniMap } from '../components/MiniMap'
import styles from './FirstMate.module.css'

const SYSTEM_GROUPS = {
  weapon:    ['mine', 'torpedo'] as SystemName[],
  detection: ['drone', 'sonar'] as SystemName[],
  special:   ['silence', 'scenario'] as SystemName[],
}

const SYSTEM_COLOR: Partial<Record<SystemName, string>> = {
  mine: '#ef4444', torpedo: '#ef4444',
  drone: '#22c55e', sonar: '#22c55e',
  silence: '#eab308', scenario: '#eab308',
}

const SYSTEM_LABEL: Partial<Record<SystemName, string>> = {
  scenario: 'Heal',
}

export function FirstMate() {
  const { room, player } = useGameStore()
  const [combatPending, setCombatPending] = useState(false)
  const [estimate, setEstimate] = useState<{ row: number; col: number; age: number } | null>(null)

  useEffect(() => {
    socket.on('combat:incoming', () => setCombatPending(true))
    socket.on('combat:resolved', () => setCombatPending(false))
    socket.on('radioOp:estimate', ({ position, age }) =>
      setEstimate(position ? { ...position, age } : null)
    )
    return () => {
      socket.off('combat:incoming')
      socket.off('combat:resolved')
      socket.off('radioOp:estimate')
    }
  }, [])

  if (!room || !player) return null

  const sub = room.teams[player.team].submarine
  const systems = sub.systems
  const actionUsed = sub.pendingTasks.firstMateDone

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

  function markGauge(system: SystemName) {
    socket.emit('firstMate:markGauge', { roomId: room!.id, system })
  }

  function activateSystem(system: SystemName) {
    socket.emit('system:activate', { roomId: room!.id, system })
  }

  function respondHit(result: 'clear' | 'indirect' | 'direct') {
    socket.emit('combat:respondHit', { roomId: room!.id, result })
  }

  return (
    <div className={styles.firstMate}>
      {combatPending && (
        <div className={styles.combatModal}>
          <h3>INCOMING ATTACK!</h3>
          <p>Assess the hit:</p>
          <div className={styles.combatActions}>
            <button onClick={() => respondHit('clear')} className={styles.clearBtn}>Clear — No damage</button>
            <button onClick={() => respondHit('indirect')} className={styles.indirectBtn}>Indirect — 1 damage</button>
            <button onClick={() => respondHit('direct')} className={styles.directBtn}>Direct — 2 damage</button>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* Col 1: MiniMap + hull + vessel stats */}
        <div className={styles.colLeft}>
          <MiniMap scenario={room.scenario} submarine={sub} size={160} estimate={estimate} />

          <section className={styles.hullSection}>
            <h3>Hull Integrity</h3>
            <div className={styles.damageTrack}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={i < sub.damage ? styles.damageHit : styles.damageOk} />
              ))}
            </div>
            <span className={styles.damageLabel}>{sub.damage} / 4 damage</span>
          </section>

          <section className={styles.vesselStats}>
            <h3>Vessel Status</h3>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>ACTION</span>
              <span className={`${styles.statValue} ${actionUsed ? styles.statUsed : styles.statAvail}`}>
                {actionUsed ? 'DONE' : 'AVAIL'}
              </span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>POSITION</span>
              <span className={styles.statValue}>
                {sub.position ? `${sub.position.row},${sub.position.col}` : 'NO FIX'}
              </span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>MINES LAID</span>
              <span className={styles.statValue}>{sub.mines.length}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>ROUTE</span>
              <span className={styles.statValue}>{sub.route.length} moves</span>
            </div>
          </section>
        </div>

        {/* Col 2: System gauges */}
        <div className={styles.colMid}>
          {(Object.entries(SYSTEM_GROUPS) as [string, SystemName[]][]).map(([group, sysList]) => (
            <section key={group} className={styles.group}>
              <h3>{group.charAt(0).toUpperCase() + group.slice(1)} Systems</h3>
              <div className={styles.gauges}>
                {sysList.map((sys) => {
                  const g = systems[sys]
                  const color = SYSTEM_COLOR[sys]
                  const locked = isSystemLocked(sys)
                  return (
                    <div key={sys} className={`${styles.gauge} ${g.ready && !locked ? styles.ready : ''} ${locked ? styles.gaugeLocked : ''}`} style={g.ready && !locked ? { borderColor: color, boxShadow: `0 0 8px ${color}33` } : undefined}>
                      <div className={styles.gaugeName} style={{ color: locked ? 'var(--accent-red)' : color }}>{SYSTEM_LABEL[sys] ?? sys}</div>
                      {sys === 'scenario' ? (
                        <div className={styles.gaugeTrack}>
                          {Array.from({ length: 6 }).map((_, row) => (
                            <div key={row} style={{ display: 'flex', gap: 3 }}>
                              {Array.from({ length: 2 }).map((__, i) => {
                                const idx = row * 2 + i
                                return (
                                  <div
                                    key={idx}
                                    className={idx < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}
                                    style={{ flex: 1, ...(idx < g.filled ? { background: color } : undefined) }}
                                  />
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.gaugeTrack}>
                          {Array.from({ length: g.total }).map((_, i) => (
                            <div
                              key={i}
                              className={i < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}
                              style={i < g.filled ? { background: color } : undefined}
                            />
                          ))}
                        </div>
                      )}
                      <div className={styles.gaugeActions}>
                        <button onClick={() => markGauge(sys)} disabled={g.ready || actionUsed}>+1</button>
                        {(sys === 'drone' || sys === 'sonar') && (
                          <button onClick={() => activateSystem(sys)} disabled={!g.ready || locked} className={g.ready && !locked ? styles.fireBtn : ''} style={g.ready && !locked ? { borderColor: color, color } : undefined}>
                            {locked ? '✕' : 'FIRE'}
                          </button>
                        )}
                        {g.ready && sys !== 'drone' && sys !== 'sonar' && (
                          <span className={styles.readyBadge} style={{ color: locked ? 'var(--accent-red)' : color }}>{locked ? 'BLOCKED' : 'READY'}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Col 3: System status summary */}
        <div className={styles.colRight}>
          <section className={styles.statusSummary}>
            <h3>System Status</h3>
            {(Object.keys(systems) as SystemName[]).map((sys) => {
              const g = systems[sys]
              const locked = isSystemLocked(sys)
              const color = SYSTEM_COLOR[sys]
              let statusClass = styles.statusCharging
              let statusText = `${g.filled}/${g.total}`
              if (g.ready && locked) { statusClass = styles.statusLocked; statusText = 'BLOCKED' }
              else if (g.ready)      { statusClass = styles.statusReady;  statusText = 'READY' }
              return (
                <div key={sys} className={styles.summaryRow}>
                  <span className={styles.summaryLabel} style={{ color }}>{SYSTEM_LABEL[sys] ?? sys}</span>
                  <span className={statusClass} style={statusClass === styles.statusReady ? { color } : undefined}>{statusText}</span>
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
