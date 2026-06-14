/** Leaderboard REST route. */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { weekStartMs, weeklyLeaderboard } from './leaderboard.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/leaderboard', { preHandler: requireAuth }, async () => {
    const since = weekStartMs();
    return { weekStart: since, entries: weeklyLeaderboard(app.db, since, 20) };
  });
}
