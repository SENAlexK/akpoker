/**
 * Avatar pipeline. Uploaded images are MIME-sniffed, re-encoded and downscaled to
 * a 256px square webp (strips EXIF / hostile payloads). Users with no avatar get a
 * deterministic jdenticon SVG seeded by their id.
 */
import { toSvg } from 'jdenticon';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const ALLOWED_MAGIC: { bytes: number[]; offset?: number }[] = [
  { bytes: [0xff, 0xd8, 0xff] }, // jpeg
  { bytes: [0x89, 0x50, 0x4e, 0x47] }, // png
  { bytes: [0x52, 0x49, 0x46, 0x46] }, // webp (RIFF....WEBP)
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // gif
];

export function sniffImage(buf: Buffer): boolean {
  return ALLOWED_MAGIC.some(({ bytes, offset = 0 }) =>
    bytes.every((b, i) => buf[offset + i] === b),
  );
}

function avatarPath(dir: string, userId: string): string {
  return resolve(join(dir, `${userId}.webp`));
}

/** Process and store an uploaded avatar; returns the public URL. */
export async function storeAvatar(dir: string, userId: string, input: Buffer): Promise<string> {
  if (!sniffImage(input)) throw new Error('unsupported-image');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const webp = await sharp(input)
    .rotate() // honor EXIF orientation, then strip metadata
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
  await writeFile(avatarPath(dir, userId), webp);
  return `/api/avatar/${userId}`;
}

export async function readStoredAvatar(dir: string, userId: string): Promise<Buffer | null> {
  const p = avatarPath(dir, userId);
  if (!existsSync(p)) return null;
  return readFile(p);
}

/** Deterministic default avatar (SVG) for users without an upload. */
export function defaultAvatarSvg(userId: string): string {
  return toSvg(userId, 256);
}
