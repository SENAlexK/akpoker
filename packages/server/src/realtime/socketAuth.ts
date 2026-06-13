/**
 * Socket.IO handshake auth: parse the access-token cookie from the handshake
 * headers and verify it. The SAME httpOnly cookie authenticates HTTP and WS, so
 * no token is ever exposed to client JS. connectionStateRecovery must NOT skip
 * this middleware (a kicked/expired user must not be silently readmitted).
 */
import fastifyCookie from '@fastify/cookie';
import type { Socket } from 'socket.io';
import type { Env } from '../config/env.js';
import { ACCESS_COOKIE } from '../auth/cookies.js';
import { verifyAccessToken, type AccessClaims } from '../auth/tokens.js';

export async function authenticateSocket(env: Env, socket: Socket): Promise<AccessClaims> {
  const header = socket.handshake.headers.cookie;
  if (!header) throw new Error('AUTH_REQUIRED');
  const cookies = fastifyCookie.parse(header);
  const token = cookies[ACCESS_COOKIE];
  if (!token) throw new Error('AUTH_REQUIRED');
  return verifyAccessToken(env, token); // throws on invalid/expired
}
