import { io } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@submarine/shared'

export const socket = io<ServerToClientEvents, ClientToServerEvents>({
  autoConnect: false,
})
