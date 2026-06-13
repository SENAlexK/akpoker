/**
 * Voice signaling over the authenticated Socket.IO connection. SDP/ICE are
 * relayed opaquely (but zod-bounded for size) to the target user's private room.
 * Voice is gated on occupying a seat at the table and capped by VoiceRoster.
 */
import {
  voiceAnswerInput,
  voiceIceInput,
  voiceJoinInput,
  voiceLeaveInput,
  voiceOfferInput,
  type Ack,
  type ClientToServerEvents,
  type IceServerConfig,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@akpoker/shared';
import type { Socket } from 'socket.io';
import type { Env } from '../config/env.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { IoServer } from '../realtime/io.js';
import { mintIceServers } from './turnCredentials.js';
import type { VoiceRoster } from './voiceRoster.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Tiny per-socket token bucket for signaling abuse control. */
function makeLimiter(capacity: number, refillPerSec: number) {
  let tokens = capacity;
  let last = Date.now();
  return (): boolean => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function registerVoiceHandlers(
  io: IoServer,
  socket: AppSocket,
  rooms: RoomManager,
  roster: VoiceRoster,
  env: Env,
): void {
  const userId = socket.data.userId;
  const iceLimiter = makeLimiter(60, 30);
  const sdpLimiter = makeLimiter(20, 5);

  socket.on('voice:join', (input, ack: Ack<{ iceServers: IceServerConfig[]; peers: string[] }>) => {
    const parsed = voiceJoinInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    if (!table.isSeated(userId)) return ack({ ok: false, error: 'must-be-seated' });
    if (!roster.add(parsed.data.tableId, userId)) return ack({ ok: false, error: 'voice-full' });

    const peers = roster.peers(parsed.data.tableId).filter((p) => p !== userId);
    io.to(`table:${parsed.data.tableId}`).emit('voice:peer-joined', { tableId: parsed.data.tableId, userId });
    ack({ ok: true, data: { iceServers: mintIceServers(env, userId), peers } });
  });

  socket.on('voice:leave', (input) => {
    const parsed = voiceLeaveInput.safeParse(input);
    if (!parsed.success) return;
    roster.remove(parsed.data.tableId, userId);
    io.to(`table:${parsed.data.tableId}`).emit('voice:peer-left', { tableId: parsed.data.tableId, userId });
  });

  const relay = (toUserId: string, event: 'voice:offer' | 'voice:answer', sdp: string) => {
    io.to(`user:${toUserId}`).emit(event, { fromUserId: userId, sdp });
  };

  socket.on('voice:offer', (input) => {
    if (!sdpLimiter()) return;
    const parsed = voiceOfferInput.safeParse(input);
    if (!parsed.success) return;
    if (!roster.peers(parsed.data.tableId).includes(parsed.data.toUserId)) return;
    relay(parsed.data.toUserId, 'voice:offer', parsed.data.sdp);
  });

  socket.on('voice:answer', (input) => {
    if (!sdpLimiter()) return;
    const parsed = voiceAnswerInput.safeParse(input);
    if (!parsed.success) return;
    if (!roster.peers(parsed.data.tableId).includes(parsed.data.toUserId)) return;
    relay(parsed.data.toUserId, 'voice:answer', parsed.data.sdp);
  });

  socket.on('voice:ice-candidate', (input) => {
    if (!iceLimiter()) return;
    const parsed = voiceIceInput.safeParse(input);
    if (!parsed.success) return;
    if (!roster.peers(parsed.data.tableId).includes(parsed.data.toUserId)) return;
    io.to(`user:${parsed.data.toUserId}`).emit('voice:ice-candidate', {
      fromUserId: userId,
      candidate: parsed.data.candidate,
    });
  });
}
