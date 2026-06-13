/** Admin HTTP routes that act on the LIVE game (require an admin account). */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/guards.js';
import type { RoomManager } from '../rooms/RoomManager.js';

const setStackInput = z
  .object({
    tableId: z.string().min(1),
    amount: z.number().int().min(0),
    seatNo: z.number().int().min(0).optional(),
    nickname: z.string().optional(),
  })
  .refine((d) => d.seatNo !== undefined || !!d.nickname, { message: 'seatNo or nickname required' });

export function registerAdminRoutes(app: FastifyInstance, rooms: RoomManager): void {
  // Set a seated player's live table chips (between hands). Prank-friendly.
  app.post('/api/admin/stack', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = setStackInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-input' });
    const table = rooms.get(parsed.data.tableId);
    if (!table) return reply.code(404).send({ error: 'table-not-found' });

    let seatNo = parsed.data.seatNo;
    if (seatNo === undefined && parsed.data.nickname) {
      const found = table.findSeatNoByNickname(parsed.data.nickname);
      if (found === null) return reply.code(404).send({ error: 'nickname-not-seated' });
      seatNo = found;
    }
    const res = await table.adminSetStack(seatNo!, parsed.data.amount);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    return reply.send({ ok: true });
  });
}
