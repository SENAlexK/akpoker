/**
 * Attach Socket.IO to Fastify's raw HTTP server (first-party, fully typed). The
 * handshake is authenticated from the access-token cookie; tables map to rooms;
 * private data flows only through the per-user `user:<id>` room.
 */
import {
  CONNECTION_RECOVERY_MS,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@akpoker/shared';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { allowedOrigins, type Env } from '../config/env.js';
import type { DB } from '../db/client.js';
import { RoomManager } from '../rooms/RoomManager.js';
import { VoiceRoster } from '../voice/voiceRoster.js';
import { registerVoiceHandlers } from '../voice/signalingHandlers.js';
import { authenticateSocket } from './socketAuth.js';
import { registerHandlers } from './handlers.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface Realtime {
  io: IoServer;
  rooms: RoomManager;
}

export function attachRealtime(app: FastifyInstance, env: Env, db: DB): Realtime {
  const io: IoServer = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: allowedOrigins(env), credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: CONNECTION_RECOVERY_MS,
      skipMiddlewares: false, // MUST re-auth on recovery
    },
  });

  const rooms = new RoomManager(db, io, app.log);
  const voiceRoster = new VoiceRoster();

  io.use(async (socket, next) => {
    try {
      const claims = await authenticateSocket(env, socket);
      socket.data.userId = claims.sub;
      socket.data.nickname = claims.nickname;
      socket.data.avatarUrl = claims.avatarUrl;
      socket.data.role = claims.role;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, nickname } = socket.data;
    void socket.join(`user:${userId}`);
    if (socket.data.role === 'admin') void socket.join('admins'); // sees all rooms incl. private
    app.log.debug(`socket connected: ${nickname} (${userId})`);

    registerHandlers(io, socket, rooms);
    registerVoiceHandlers(io, socket, rooms, voiceRoster, env);
    rooms.resyncUserEverywhere(userId);

    socket.on('disconnect', (reason) => {
      app.log.debug(`socket disconnected: ${nickname} (${reason})`);
      // If the user has no other live sockets, let tables auto-fold/sit-out + drop voice.
      void io
        .in(`user:${userId}`)
        .fetchSockets()
        .then((sockets) => {
          if (sockets.length === 0) {
            rooms.disconnectUserEverywhere(userId);
            for (const tableId of voiceRoster.removeEverywhere(userId)) {
              io.to(`table:${tableId}`).emit('voice:peer-left', { tableId, userId });
            }
          }
        });
    });
  });

  return { io, rooms };
}
