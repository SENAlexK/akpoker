/**
 * Socket event handlers. Thin: validate every payload with zod, then route to the
 * authoritative RoomManager / TableRuntime. No game logic lives here.
 */
import {
  chatSendInput,
  createRoomInput,
  deleteRoomInput,
  joinTableInput,
  leaveTableInput,
  readyInput,
  rebuyInput,
  resolveInviteInput,
  sitInput,
  standInput,
  tableActionInput,
  type ClientToServerEvents,
} from '@akpoker/shared';
import type { Socket } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { IoServer } from './io.js';
import type { InterServerEvents, ServerToClientEvents, SocketData } from '@akpoker/shared';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerHandlers(_io: IoServer, socket: AppSocket, rooms: RoomManager): void {
  const userId = socket.data.userId;
  const user = { userId, nickname: socket.data.nickname, avatarUrl: socket.data.avatarUrl };

  socket.on('room:list', (ack) => ack({ ok: true, data: rooms.list(socket.data.role === 'admin') }));

  socket.on('room:create', (input, ack) => {
    const parsed = createRoomInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const { tableId, inviteCode } = rooms.create(userId, parsed.data);
    ack({ ok: true, data: { tableId, inviteCode } });
  });

  socket.on('room:resolveInvite', (input, ack) => {
    const parsed = resolveInviteInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.resolveInvite(parsed.data.code);
    if (!table) return ack({ ok: false, error: 'not-found' });
    const li = table.listItem();
    ack({
      ok: true,
      data: {
        tableId: li.tableId,
        name: li.name,
        smallBlind: li.smallBlind,
        bigBlind: li.bigBlind,
        occupiedSeats: li.occupiedSeats,
        maxSeats: li.maxSeats,
      },
    });
  });

  socket.on('table:join', async (input, ack) => {
    const parsed = joinTableInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    rooms.cancelDestroy(table.config.id);
    await socket.join(`table:${table.config.id}`);
    table.addSpectator(userId);
    ack({ ok: true, data: table.snapshotFor(userId) });
  });

  socket.on('room:delete', async (input, ack) => {
    const parsed = deleteRoomInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const res = await rooms.closeRoom(parsed.data.tableId, userId, socket.data.role === 'admin');
    if (!res.ok) return ack({ ok: false, error: res.error });
    ack({ ok: true, data: null });
  });

  socket.on('table:leave', async (input, ack) => {
    const parsed = leaveTableInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (table) {
      await table.stand(userId);
      table.removeSpectator(userId);
      await socket.leave(`table:${table.config.id}`);
    }
    ack({ ok: true, data: null });
  });

  socket.on('seat:sit', async (input, ack) => {
    const parsed = sitInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    await socket.join(`table:${table.config.id}`);
    const res = await table.sit(user, parsed.data.seatNo, parsed.data.buyIn);
    if (!res.ok) return ack({ ok: false, error: res.error });
    rooms.emitLobby();
    ack({ ok: true, data: table.snapshotFor(userId) });
  });

  socket.on('seat:stand', async (input, ack) => {
    const parsed = standInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: true, data: { chips: 0, rebate: 0 } });
    const res = await table.stand(userId);
    rooms.emitLobby();
    ack({ ok: true, data: res });
  });

  socket.on('seat:ready', async (input, ack) => {
    const parsed = readyInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    const res = await table.setReady(userId, parsed.data.ready);
    if (!res.ok) return ack({ ok: false, error: res.error });
    ack({ ok: true, data: null });
  });

  socket.on('table:action', async (input, ack) => {
    const parsed = tableActionInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    const res = await table.act(
      userId,
      { type: parsed.data.type, amount: parsed.data.amount },
      parsed.data.clientActionId,
      parsed.data.expectedVersion,
    );
    if (!res.ok) return ack({ ok: false, error: res.error });
    ack({ ok: true, data: null });
  });

  socket.on('chat:send', (input, ack) => {
    const parsed = chatSendInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    table.chat(userId, socket.data.nickname, {
      kind: parsed.data.kind,
      text: parsed.data.text,
      mediaUrl: parsed.data.mediaUrl,
    });
    ack({ ok: true, data: null });
  });

  socket.on('seat:rebuy', async (input, ack) => {
    const parsed = rebuyInput.safeParse(input);
    if (!parsed.success) return ack({ ok: false, error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return ack({ ok: false, error: 'not-found' });
    const res = await table.rebuy(userId, parsed.data.amount);
    if (!res.ok) return ack({ ok: false, error: res.error });
    ack({ ok: true, data: table.snapshotFor(userId) });
  });
}
