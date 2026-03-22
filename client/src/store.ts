import { create } from 'zustand'
import type { GameRoom, Player, Role, Team } from '@submarine/shared'

interface GameStore {
  // Identity
  player: Player | null
  roomId: string | null

  // Room
  room: GameRoom | null

  // Dev
  devMode: boolean

  // Actions
  setPlayer: (p: Player) => void
  setRoomId: (id: string) => void
  setRoom: (r: GameRoom) => void
  setDevMode: (on: boolean) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  player: null,
  roomId: null,
  room: null,
  devMode: false,

  setPlayer: (player) => set({ player }),
  setRoomId: (roomId) => set({ roomId }),
  setRoom: (room) => set({ room }),
  setDevMode: (devMode) => set({ devMode }),
  reset: () => set({ player: null, roomId: null, room: null, devMode: false }),
}))
