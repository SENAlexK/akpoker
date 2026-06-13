/**
 * Ephemeral TURN credentials (coturn `use-auth-secret` / REST API). The static
 * secret never leaves the server: username = `${expiry}:${userId}`, credential =
 * base64(HMAC-SHA1(username, secret)). If no TURN secret is configured we return
 * STUN only (works on most networks; TURN is the NAT-traversal fallback).
 */
import type { IceServerConfig } from '@akpoker/shared';
import { createHmac } from 'node:crypto';
import type { Env } from '../config/env.js';

export function mintIceServers(env: Env, userId: string): IceServerConfig[] {
  const servers: IceServerConfig[] = env.STUN_URLS.split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));

  if (env.TURN_HOST && env.TURN_STATIC_AUTH_SECRET) {
    const expiry = Math.floor(Date.now() / 1000) + env.TURN_TTL_SECONDS;
    const username = `${expiry}:${userId}`;
    const credential = createHmac('sha1', env.TURN_STATIC_AUTH_SECRET).update(username).digest('base64');
    // UDP first (best), TCP as a fallback when UDP is blocked. Plain turn: needs no
    // TLS cert; add a turns:5349 entry only if HTTPS certs are configured for coturn.
    servers.push({
      urls: [
        `turn:${env.TURN_HOST}:3478?transport=udp`,
        `turn:${env.TURN_HOST}:3478?transport=tcp`,
      ],
      username,
      credential,
    });
  }
  return servers;
}
