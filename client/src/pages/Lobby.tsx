import { useState } from 'react'
import { socket } from '../socket'
import { useGameStore } from '../store'
import type { Team, Role, ScenarioId } from '@submarine/shared'
import styles from './Lobby.module.css'

const ROLES: Role[] = ['captain', 'firstMate', 'engineer', 'radioOperator']
const ROLE_LABELS: Record<Role, string> = {
  captain: 'Captain',
  firstMate: 'First Mate',
  engineer: 'Engineer',
  radioOperator: 'Radio Operator',
}

const SCENARIOS: ScenarioId[] = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

const isDev = new URLSearchParams(window.location.search).get('dev') === '1'

export function Lobby() {
  const { room, setRoomId, setPlayer, setDevMode } = useGameStore()
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [team, setTeam] = useState<Team>('alpha')
  const [role, setRole] = useState<Role>('captain')
  const [scenario, setScenario] = useState<ScenarioId>('alpha')
  const [error, setError] = useState('')

  function createRoom() {
    if (!name.trim()) return setError('Enter your name first')
    socket.emit('room:create', { playerName: name, scenario }, (roomId) => {
      setRoomId(roomId)
      setPlayer({ id: socket.id!, name, team: 'alpha', role: 'captain' })
    })
  }

  function joinRoom() {
    if (!name.trim()) return setError('Enter your name first')
    if (!roomCode.trim()) return setError('Enter a room code')
    socket.emit('room:join', { roomId: roomCode.toUpperCase(), playerName: name, team, role }, (ok, err) => {
      if (!ok) return setError(err ?? 'Could not join room')
      setRoomId(roomCode.toUpperCase())
      setPlayer({ id: socket.id!, name, team, role })
    })
  }

  function startGame() {
    if (!room) return
    socket.emit('game:start', { roomId: room.id })
  }

  async function devQuickStart() {
    const playerName = name.trim() || 'Dev'
    const res = await fetch('/api/dev/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    })
    const { roomId } = await res.json()
    setRoomId(roomId)
    socket.emit('room:join', { roomId, playerName, team: 'alpha', role: 'captain' }, (ok: boolean, err?: string) => {
      if (!ok) return setError(err ?? 'Dev setup failed')
      setPlayer({ id: socket.id!, name: playerName, team: 'alpha', role: 'captain' })
      setDevMode(true)
    })
  }

  const takenRoles = room
    ? [...room.teams.alpha.players, ...room.teams.beta.players].map((p) => `${p.team}:${p.role}`)
    : []

  return (
    <div className={styles.lobby}>
      <header className={styles.header}>
        <h1>Submarine Command</h1>
        <p className={styles.subtitle}>Synchronize · Organize · Navigate · Attack · Repair</p>
      </header>

      <div className={styles.panels}>
        {/* Identity */}
        <section className={styles.panel}>
          <h2>Your details</h2>
          <label>Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Officer name" />
          </label>
        </section>

        {/* Create */}
        <section className={styles.panel}>
          <h2>Create room</h2>
          <label>Scenario
            <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>
          <button onClick={createRoom}>Create</button>
        </section>

        {/* Join */}
        <section className={styles.panel}>
          <h2>Join room</h2>
          <label>Room code
            <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="XXXXXX" maxLength={6} />
          </label>
          <label>Team
            <select value={team} onChange={(e) => setTeam(e.target.value as Team)}>
              <option value="alpha">Alpha</option>
              <option value="beta">Beta</option>
            </select>
          </label>
          <label>Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r} disabled={takenRoles.includes(`${team}:${r}`)}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={joinRoom}>Join</button>
        </section>
      </div>

      {isDev && (
        <div className={styles.panel} style={{ borderColor: '#f0a500', marginTop: '1rem' }}>
          <h2>Dev Mode</h2>
          <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Creates a full game instantly with ghost players</p>
          <button onClick={devQuickStart} style={{ background: '#f0a500', color: '#000' }}>
            ⚡ Quick Dev Start
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {room && (
        <div className={styles.roomInfo}>
          <h2>Room: <span className={styles.code}>{room.id}</span></h2>
          <div className={styles.teams}>
            {(['alpha', 'beta'] as Team[]).map((t) => (
              <div key={t} className={styles.team}>
                <h3>Team {t}</h3>
                {ROLES.map((r) => {
                  const p = room.teams[t].players.find((pl) => pl.role === r)
                  return (
                    <div key={r} className={styles.slot}>
                      <span className={styles.roleLabel}>{ROLE_LABELS[r]}</span>
                      <span className={p ? styles.filled : styles.empty}>
                        {p ? p.name : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startGame}>
            Start Game
          </button>
        </div>
      )}
    </div>
  )
}
