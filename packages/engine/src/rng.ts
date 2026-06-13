/**
 * RNG seam. The engine never calls a global random source directly — it receives
 * an Rng. Production uses a deterministic HMAC-SHA256 DRBG seeded from the
 * commit-reveal triple (serverSeed, clientSeed, nonce); tests can inject a
 * reproducible counter RNG. Both use rejection sampling for unbiased bounded
 * integers (no modulo bias).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Unbiased bounded int from a function yielding 32-bit unsigned words. */
function boundedInt(maxExclusive: number, nextU32: () => number): number {
  if (maxExclusive <= 0) throw new RangeError('maxExclusive must be > 0');
  if (maxExclusive === 1) return 0;
  // Rejection sampling: discard values in the biased tail.
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let x: number;
  do {
    x = nextU32();
  } while (x >= limit);
  return x % maxExclusive;
}

/**
 * Deterministic DRBG: an HMAC-SHA256 keystream keyed by `seed`, producing an
 * endless sequence of 32-bit words. Same seed → same sequence → reproducible,
 * auditable shuffle.
 */
export function drbgFromSeed(seed: string): Rng {
  const key = createHash('sha256').update(seed).digest();
  let counter = 0;
  let block = Buffer.alloc(0);
  let offset = 0;

  const refill = (): void => {
    const ctr = Buffer.alloc(8);
    ctr.writeBigUInt64BE(BigInt(counter++));
    block = createHmac('sha256', key).update(ctr).digest(); // 32 bytes = 8 words
    offset = 0;
  };

  const nextU32 = (): number => {
    if (offset + 4 > block.length) refill();
    const v = block.readUInt32BE(offset);
    offset += 4;
    return v;
  };

  return { int: (m) => boundedInt(m, nextU32) };
}

/**
 * Commit-reveal material for a single hand. `deckCommit = sha256(serverSeed)` is
 * published before the deal; `serverSeed` is revealed after, so anyone can
 * recompute the exact deck and verify it matches the commitment.
 */
export interface ShuffleSeed {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  deckCommit: string;
}

export function createShuffleSeed(clientSeed: string, nonce: number): ShuffleSeed {
  const serverSeed = randomBytes(32).toString('hex');
  const deckCommit = createHash('sha256').update(serverSeed).digest('hex');
  return { serverSeed, clientSeed, nonce, deckCommit };
}

export function commitOf(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex');
}

/** Build the production Rng for a hand from its commit-reveal material. */
export function rngForHand(seed: ShuffleSeed): Rng {
  return drbgFromSeed(`${seed.serverSeed}:${seed.clientSeed}:${seed.nonce}`);
}

/** Deterministic test RNG: a fixed sequence of 32-bit words (cycled). */
export function seqRng(words: number[]): Rng {
  if (words.length === 0) throw new Error('seqRng needs at least one word');
  let i = 0;
  const nextU32 = (): number => {
    const w = words[i % words.length]!;
    i++;
    return w >>> 0;
  };
  return { int: (m) => boundedInt(m, nextU32) };
}
