import type { Role, Team } from '@submarine/shared'
import { useGameStore } from '../store'
import { Captain } from '../roles/Captain'
import { FirstMate } from '../roles/FirstMate'
import { Engineer } from '../roles/Engineer'
import { RadioOperator } from '../roles/RadioOperator'
import styles from './Game.module.css'

const TEAMS: Team[] = ['alpha', 'beta']
const ROLES: Role[] = ['captain', 'firstMate', 'engineer', 'radioOperator']
const ROLE_LABELS: Record<Role, string> = {
  captain: 'Captain',
  firstMate: 'First Mate',
  engineer: 'Engineer',
  radioOperator: 'Radio Op',
}

export function Game() {
  const { player, room, devMode, setPlayer } = useGameStore()

  if (!player || !room) return null

  const renderRole = () => {
    switch (player.role) {
      case 'captain':       return <Captain />
      case 'firstMate':     return <FirstMate />
      case 'engineer':      return <Engineer />
      case 'radioOperator': return <RadioOperator />
    }
  }

  const teamSub = room.teams[player.team].submarine
  const damage = teamSub.damage

  return (
    <div className={styles.game}>
      <header className={styles.topBar}>
        <span className={styles.roomCode}>#{room.id}</span>
        <span className={styles.scenario}>Scenario: {room.scenario.toUpperCase()}</span>
        <span className={styles.role}>{player.team.toUpperCase()} · {player.role.toUpperCase()}</span>
        <span className={styles.damage}>
          Hull: {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className={i < damage ? styles.dmgFilled : styles.dmgEmpty}>■</span>
          ))}
        </span>
      </header>

      <main className={styles.main}>
        {renderRole()}
      </main>

      {devMode && (
        <div style={{
          position: 'fixed', bottom: '1rem', right: '1rem',
          background: '#1a1a2e', border: '1px solid #f0a500',
          borderRadius: '8px', padding: '0.5rem', zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: '0.25rem',
        }}>
          <div style={{ fontSize: '0.7rem', color: '#f0a500', marginBottom: '0.25rem' }}>⚡ DEV</div>
          {TEAMS.map(t => (
            <div key={t} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', width: '2.5rem' }}>{t}</span>
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => setPlayer({ ...player, team: t, role: r })}
                  style={{
                    fontSize: '0.65rem', padding: '2px 6px', cursor: 'pointer',
                    background: player.team === t && player.role === r ? '#f0a500' : '#333',
                    color: player.team === t && player.role === r ? '#000' : '#ccc',
                    border: '1px solid #555', borderRadius: '4px',
                  }}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
