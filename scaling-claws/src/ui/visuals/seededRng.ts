const DEFAULT_SEED = 0x9e3779b9;

function normalizeSeed(seed: number): number {
  const normalized = (seed >>> 0);
  return normalized === 0 ? DEFAULT_SEED : normalized;
}

export function hashSeed(seed: number, salt: number): number {
  let x = normalizeSeed(seed) ^ normalizeSeed(salt);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return normalizeSeed(x);
}

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = normalizeSeed(x);
    return this.state / 4294967296;
  }

  nextRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return min + ((max - min) * this.next());
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) {
      return 0;
    }
    return Math.floor(this.next() * maxExclusive);
  }
}
