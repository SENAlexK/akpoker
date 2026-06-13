/**
 * httpOnly + Secure + SameSite=Lax cookies for access + refresh tokens.
 * The Socket.IO handshake reads the access cookie (see realtime/socketAuth.ts),
 * so no token is ever exposed to client JS.
 */
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from '@akpoker/shared';
import type { FastifyReply } from 'fastify';
import type { Env } from '../config/env.js';

export const ACCESS_COOKIE = 'ak_at';
export const REFRESH_COOKIE = 'ak_rt';

function baseOpts(env: Env) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  env: Env,
  reply: FastifyReply,
  accessToken: string,
  refreshComposite: string,
): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, { ...baseOpts(env), maxAge: ACCESS_TOKEN_TTL_SEC });
  reply.setCookie(REFRESH_COOKIE, refreshComposite, {
    ...baseOpts(env),
    maxAge: REFRESH_TOKEN_TTL_SEC,
  });
}

export function clearAuthCookies(env: Env, reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, baseOpts(env));
  reply.clearCookie(REFRESH_COOKIE, baseOpts(env));
}
