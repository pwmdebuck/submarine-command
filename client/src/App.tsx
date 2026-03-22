import { useEffect } from 'react'
import { useGameStore } from './store'
import { socket } from './socket'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'

export function App() {
  const { room, setRoom } = useGameStore()

  useEffect(() => {
    socket.connect()

    socket.on('room:updated', setRoom)
    socket.on('game:started', setRoom)

    return () => {
      socket.off('room:updated', setRoom)
      socket.off('game:started', setRoom)
      socket.disconnect()
    }
  }, [setRoom])

  if (!room || room.phase === 'lobby') {
    return <Lobby />
  }

  return <Game />
}
