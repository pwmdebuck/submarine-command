import { Router } from 'express'
import { roomStore } from './roomStore.js'
import type { ScenarioId, GameMode, Player } from '@submarine/shared'

export const roomRouter = Router()

roomRouter.post('/rooms', (req, res) => {
  const { scenario = 'alpha', mode = 'realtime' } = req.body as {
    scenario?: ScenarioId
    mode?: GameMode
  }
  const room = roomStore.create(scenario, mode)
  res.json({ roomId: room.id })
})

roomRouter.post('/dev/setup', (req, res) => {
  const { playerName = 'Dev' } = req.body as { playerName?: string }
  const room = roomStore.create('alpha', 'realtime')

  const ghosts: Player[] = [
    { id: 'ghost:alpha:firstMate',     name: playerName, team: 'alpha', role: 'firstMate' },
    { id: 'ghost:alpha:engineer',      name: playerName, team: 'alpha', role: 'engineer' },
    { id: 'ghost:alpha:radioOperator', name: playerName, team: 'alpha', role: 'radioOperator' },
    { id: 'ghost:beta:captain',        name: playerName, team: 'beta',  role: 'captain' },
    { id: 'ghost:beta:firstMate',      name: playerName, team: 'beta',  role: 'firstMate' },
    { id: 'ghost:beta:engineer',       name: playerName, team: 'beta',  role: 'engineer' },
    { id: 'ghost:beta:radioOperator',  name: playerName, team: 'beta',  role: 'radioOperator' },
  ]

  for (const ghost of ghosts) {
    room.teams[ghost.team].players.push(ghost)
  }

  // Set starting positions (safe corners, verified clear of alpha map islands)
  const alphaStart = { row: 1, col: 0 }
  room.teams.alpha.submarine.position = alphaStart
  room.teams.alpha.submarine.route = [alphaStart]

  const betaStart = { row: 13, col: 14 }
  room.teams.beta.submarine.position = betaStart
  room.teams.beta.submarine.route = [betaStart]

  room.phase = 'playing'
  roomStore.save(room)

  res.json({ roomId: room.id })
})

roomRouter.get('/rooms/:id', (req, res) => {
  const room = roomStore.get(req.params.id)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json(room)
})
