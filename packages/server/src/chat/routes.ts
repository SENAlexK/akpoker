/** Chat media (images / voice clips): authenticated upload + public serve. */
import { createId } from '@paralleldrive/cuid2';
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { requireAuth } from '../auth/guards.js';

const MAX_BYTES = 4 * 1024 * 1024;

// mimetype -> extension (allowlist). Voice clips are usually webm/ogg/mp4 from MediaRecorder.
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};
const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  weba: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const dir = resolve(app.appEnv.DATA_DIR, 'chat');

  app.post('/api/chat/upload', { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) return reply.code(400).send({ error: 'no-file' });
    const ext = EXT[file.mimetype];
    if (!ext) return reply.code(415).send({ error: 'unsupported-type' });
    const buf = await file.toBuffer();
    if (buf.length === 0) return reply.code(400).send({ error: 'empty' });
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const name = `${createId()}.${ext}`;
    await writeFile(join(dir, name), buf);
    return reply.send({ url: `/api/chat/media/${name}` });
  });

  app.get<{ Params: { file: string } }>('/api/chat/media/:file', async (req, reply) => {
    const file = req.params.file;
    if (!/^[\w.-]+$/.test(file)) return reply.code(400).send({ error: 'bad-name' });
    const ext = file.split('.').pop() ?? '';
    const ct = CONTENT_TYPE[ext];
    const path = resolve(dir, file);
    if (!ct || !path.startsWith(dir) || !existsSync(path)) return reply.code(404).send({ error: 'not-found' });
    return reply.header('Content-Type', ct).header('Cache-Control', 'public, max-age=86400').send(await readFile(path));
  });
}
