/** Owns all live tables: create/get/list/destroy + invite-code index + empty-TTL teardown. */
import { INVITE_CODE_LEN, type CreateRoomInput, type RoomListItem } from '@akpoker/shared';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { customAlphabet } from 'nanoid';
import type { DB } from '../db/client.js';
import { pokerTables } from '../db/schema.js';
import type { IoServer } from '../realtime/io.js';
import { TableRuntime } from './TableRuntime.js';

const EMPTY_TTL_MS = 60_000;
const inviteCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', INVITE_CODE_LEN);

export class RoomManager {
  private tables = new Map<string, TableRuntime>();
  private byInvite = new Map<string, string>();
  private emptyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly db: DB,
    private readonly io: IoServer,
    private readonly log: FastifyBaseLogger,
  ) {}

  create(ownerUserId: string, input: CreateRoomInput): { tableId: string; inviteCode: string } {
    const id = createId();
    const code = inviteCode();
    const now = Date.now();
    this.db
      .insert(pokerTables)
      .values({
        id,
        name: input.name,
        ownerUserId,
        smallBlind: input.smallBlind,
        bigBlind: input.bigBlind,
        maxSeats: input.maxSeats,
        minBuyIn: input.minBuyIn,
        maxBuyIn: input.maxBuyIn,
        isPrivate: input.isPrivate ? 1 : 0,
        inviteCode: code,
        createdAt: now,
      })
      .run();

    const table = new TableRuntime(
      {
        id,
        name: input.name,
        ownerUserId,
        smallBlind: input.smallBlind,
        bigBlind: input.bigBlind,
        maxSeats: input.maxSeats,
        minBuyIn: input.minBuyIn,
        maxBuyIn: input.maxBuyIn,
        isPrivate: input.isPrivate,
        inviteCode: code,
      },
      { io: this.io, db: this.db, log: this.log, onEmpty: (tid) => this.scheduleDestroy(tid) },
    );
    this.tables.set(id, table);
    this.byInvite.set(code, id);
    this.emitLobby();
    return { tableId: id, inviteCode: code };
  }

  get(tableId: string): TableRuntime | undefined {
    return this.tables.get(tableId);
  }

  resolveInvite(code: string): TableRuntime | undefined {
    const id = this.byInvite.get(code.toUpperCase());
    return id ? this.tables.get(id) : undefined;
  }

  list(includePrivate = false): RoomListItem[] {
    return [...this.tables.values()]
      .filter((t) => includePrivate || !t.config.isPrivate)
      .map((t) => t.listItem());
  }

  /** A user (re)connected: refresh their view of any table they belong to. */
  resyncUserEverywhere(userId: string): void {
    for (const t of this.tables.values()) if (t.hasUser(userId)) t.resyncUser(userId);
  }

  /** A user's last socket dropped: notify every table they're in. */
  disconnectUserEverywhere(userId: string): void {
    for (const t of this.tables.values()) if (t.hasUser(userId)) t.onDisconnect(userId);
  }

  cancelDestroy(tableId: string): void {
    const timer = this.emptyTimers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.emptyTimers.delete(tableId);
    }
  }

  private scheduleDestroy(tableId: string): void {
    this.cancelDestroy(tableId);
    const timer = setTimeout(() => this.destroy(tableId), EMPTY_TTL_MS);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    this.emptyTimers.set(tableId, timer);
  }

  /** Delete a room — allowed for its owner or an admin. Cashes everyone out. */
  async closeRoom(
    tableId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const table = this.tables.get(tableId);
    if (!table) return { ok: false, error: 'not-found' };
    if (!isAdmin && table.config.ownerUserId !== requesterId) return { ok: false, error: 'forbidden' };
    this.io.to(`table:${tableId}`).emit('table:closed', { tableId });
    await table.forceClose();
    table.destroy();
    this.tables.delete(tableId);
    this.byInvite.delete(table.config.inviteCode);
    this.cancelDestroy(tableId);
    this.db.update(pokerTables).set({ closedAt: Date.now() }).where(eq(pokerTables.id, tableId)).run();
    this.emitLobby();
    return { ok: true };
  }

  destroy(tableId: string): void {
    const table = this.tables.get(tableId);
    if (!table) return;
    if (table.occupiedSeats > 0) return; // someone re-sat; keep it
    table.destroy();
    this.tables.delete(tableId);
    this.byInvite.delete(table.config.inviteCode);
    this.cancelDestroy(tableId);
    this.db
      .update(pokerTables)
      .set({ closedAt: Date.now() })
      .where(eq(pokerTables.id, tableId))
      .run();
    this.emitLobby();
  }

  emitLobby(): void {
    // Regular users see only public rooms; admins (in the 'admins' room) see all.
    this.io.except('admins').emit('lobby:rooms', this.list(false));
    this.io.to('admins').emit('lobby:rooms', this.list(true));
  }
}
