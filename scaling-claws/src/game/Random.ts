let gameRandomSeed = 0x6d2b79f5 >>> 0;

export function setGameRandomSeed(seed: number): void {
  // Keep seed as uint32 and avoid zero-lock in xorshift style generators.
  const normalized = (seed >>> 0) || 0x6d2b79f5;
  gameRandomSeed = normalized;
}

export function getGameRandomSeed(): number {
  return gameRandomSeed >>> 0;
}

export function nextGameRandom(): number {
  // Mulberry32 PRNG: fast, deterministic, adequate for gameplay randomness.
  gameRandomSeed = (gameRandomSeed + 0x6d2b79f5) >>> 0;
  let t = gameRandomSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return out;
}
