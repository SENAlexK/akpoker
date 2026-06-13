/** requireAuth preHandler: verify the access-token cookie, populate request.user. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE } from './cookies.js';
import { verifyAccessToken } from './tokens.js';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[ACCESS_COOKIE];
  if (!token) {
    await reply.code(401).send({ error: 'unauthenticated' });
    return;
  }
  try {
    req.user = await verifyAccessToken(req.server.appEnv, token);
  } catch {
    await reply.code(401).send({ error: 'token-invalid-or-expired' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (req.user && req.user.role !== 'admin') {
    await reply.code(403).send({ error: 'forbidden' });
  }
}
