import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@submarine/shared'
import { roomRouter } from './roomRouter.js'
import { registerGameHandlers } from './gameHandlers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '../../client/dist')

const app = express()
const httpServer = createServer(app)

const corsOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

export const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
})

app.use(express.json())
app.use('/api', roomRouter)
app.use(express.static(clientDist))

// SPA fallback
app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')))

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  registerGameHandlers(io, socket)

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT ?? 3001
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
