import { useEffect, useState } from 'react'
import { useGameStore } from '../store'
import { socket } from '../socket'
import type { SystemName } from '@submarine/shared'
import styles from './FirstMate.module.css'

const SYSTEM_GROUPS = {
  weapon:    ['mine', 'torpedo'] as SystemName[],
  detection: ['drone', 'sonar'] as SystemName[],
  special:   ['silence', 'scenario'] as SystemName[],
}

export function FirstMate() {
  const { room, player } = useGameStore()
  const [combatPending, setCombatPending] = useState(false)

  useEffect(() => {
    socket.on('combat:incoming', () => setCombatPending(true))
    socket.on('combat:resolved', () => setCombatPending(false))
    return () => {
      socket.off('combat:incoming')
      socket.off('combat:resolved')
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
      <h2>First Mate</h2>

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

      <div className={styles.turnStatus}>
        {actionUsed ? 'Action used — wait for next move' : 'Mark one gauge per move'}
      </div>

      <div className={styles.damage}>
        <h3>Hull Integrity</h3>
        <div className={styles.damageTrack}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={i < sub.damage ? styles.damageHit : styles.damageOk} />
          ))}
        </div>
        <span className={styles.damageLabel}>{sub.damage} / 4 damage</span>
      </div>

      {(Object.entries(SYSTEM_GROUPS) as [string, SystemName[]][]).map(([group, sysList]) => (
        <section key={group} className={styles.group}>
          <h3>{group.charAt(0).toUpperCase() + group.slice(1)} Systems</h3>
          <div className={styles.gauges}>
            {sysList.map((sys) => {
              const g = systems[sys]
              return (
                <div key={sys} className={`${styles.gauge} ${g.ready ? styles.ready : ''}`}>
                  <div className={styles.gaugeName}>{sys}</div>
                  <div className={styles.gaugeTrack}>
                    {Array.from({ length: g.total }).map((_, i) => (
                      <div
                        key={i}
                        className={i < g.filled ? styles.gaugeFilled : styles.gaugeEmpty}
                      />
                    ))}
                  </div>
                  <div className={styles.gaugeActions}>
                    <button onClick={() => markGauge(sys)} disabled={g.ready || actionUsed}>
                      +1
                    </button>
                    {(sys === 'drone' || sys === 'sonar') && (
                      <button onClick={() => activateSystem(sys)} disabled={!g.ready || isSystemLocked(sys)} className={g.ready && !isSystemLocked(sys) ? styles.fireBtn : ''}>
                        {g.ready && isSystemLocked(sys) ? 'LOCKED' : 'FIRE'}
                      </button>
                    )}
                    {g.ready && sys !== 'drone' && sys !== 'sonar' && (
                      <span className={styles.readyBadge}>{isSystemLocked(sys) ? 'LOCKED' : 'READY'}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
