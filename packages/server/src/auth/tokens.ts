/**
 * Access token = short-lived signed JWT (jose). Refresh token = opaque
 * `id.secret`; only the sha256 of the secret is stored, with rotation + reuse
 * detection. Both ride in httpOnly cookies (see cookies.ts).
 */
import { createId } from '@paralleldrive/cuid2';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from '@akpoker/shared';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';

export interface AccessClaims {
  sub: string; // userId
  nickname: string;
  avatarUrl: string;
  role: string;
}

function key(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccessToken(env: Env, claims: AccessClaims): Promise<string> {
  return new SignJWT({ nickname: claims.nickname, avatarUrl: claims.avatarUrl, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(key(env));
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(env), { algorithms: ['HS256'] });
  return {
    sub: String(payload.sub),
    nickname: String(payload.nickname ?? ''),
    avatarUrl: String(payload.avatarUrl ?? ''),
    role: String(payload.role ?? 'user'),
  };
}

export interface NewRefreshToken {
  id: string;
  secret: string;
  composite: string; // `id.secret` stored in the cookie
  tokenHash: string; // sha256(secret) stored in DB
  expiresAt: number;
}

export function createRefreshToken(): NewRefreshToken {
  const id = createId();
  const secret = randomBytes(32).toString('base64url');
  return {
    id,
    secret,
    composite: `${id}.${secret}`,
    tokenHash: hashSecret(secret),
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_SEC * 1000,
  };
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseRefreshComposite(composite: string): { id: string; secret: string } | null {
  const dot = composite.indexOf('.');
  if (dot <= 0) return null;
  return { id: composite.slice(0, dot), secret: composite.slice(dot + 1) };
}
