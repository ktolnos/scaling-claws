const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * Standard scaling factor for BigInt values that need fractional precision.
 * 1,000,000 means we support 6 decimal places.
 */
export const SCALE = 1_000_000n;

/**
 * Converts a raw number to a scaled BigInt.
 * @param n Raw value (e.g., 50.5)
 * @returns Scaled BigInt (50,500,000n)
 */
export function toBigInt(n: number): bigint {
  return BigInt(Math.floor(n * Number(SCALE)));
}

/**
 * Multiplies a BigInt literal (unscaled) by SCALE.
 * Use for constants: scaleBigInt(100n) -> 100,000,000n
 */
export function scaleBigInt(n: bigint): bigint {
  return n * SCALE;
}

/**
 * Converts a scaled BigInt back to a raw number.
 * Use for calculations that require floating point or UI percentages.
 */
export function fromBigInt(b: bigint): number {
  return Number(b) / Number(SCALE);
}

/**
 * Multiplies two scaled BigInts and returns a scaled BigInt.
 * (A/S) * (B/S) = (A*B)/S^2. Multiply by S to get scaled result: (A*B)/S.
 */
export function mulB(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}

/**
 * Divides two scaled BigInts and returns a scaled BigInt.
 * (A/S) / (B/S) = A/B. Multiply by S to get scaled result: (A*S)/B.
 */
export function divB(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  return (a * SCALE) / b;
}

/**
 * Scales a BigInt by a number (multiplier).
 */
export function scaleB(a: bigint, n: number): bigint {
  return (a * toBigInt(n)) / SCALE;
}

export function formatNumber(n: number | bigint): string {
  let val: number;
  if (typeof n === 'bigint') {
    val = fromBigInt(n);
  } else {
    val = n;
  }


  if (val < 0) return '-' + formatNumber(-val);
  if (val < 1000) return (Math.round(val * 10) / 10).toString();

  let tier = 0;
  let scaled = val;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }

  if (tier >= SUFFIXES.length) {
    return val.toExponential(1);
  }

  return (Math.round(scaled * 10) / 10).toString() + SUFFIXES[tier];
}

export function formatMoney(n: number | bigint): string {
  // Money is always scaled
  const val = typeof n === 'bigint' ? fromBigInt(n) : n;
  if (val < 0) return '-$' + formatNumber(-val);
  return '$' + formatNumber(val);
}

export function formatRate(perMin: number | bigint): string {
  const val = typeof perMin === 'bigint' ? fromBigInt(perMin) : perMin;
  if (val >= 0) return '+' + formatMoney(val) + '/min';
  return '-' + formatMoney(-val) + '/min';
}

export function formatTime(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return totalSec + 's';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? min + 'm ' + sec + 's' : min + 'm';
}

export function formatMW(mw: number | bigint): string {
  // Power is always scaled
  const val = typeof mw === 'bigint' ? fromBigInt(mw) : mw;
  if (val < 0) return '-' + formatMW(-val);
  if (val < 1) return Math.round(val * 1000).toString() + ' kW';

  const units = ['MW', 'GW', 'TW', 'PW', 'EW', 'ZW', 'YW'];
  let scaled = val;
  let unitIdx = 0;
  while (scaled >= 1000 && unitIdx < units.length - 1) {
    scaled /= 1000;
    unitIdx++;
  }
  return (Math.round(scaled * 10) / 10).toString() + ' ' + units[unitIdx];
}

export function formatFlops(flops: number | bigint): string {
  // Flops is always scaled
  const val = typeof flops === 'bigint' ? fromBigInt(flops) : flops;
  if (val < 1e3) return (Math.round(val * 10) / 10).toString() + ' PFLOPS';
  if (val < 1e6) return (Math.round((val / 1e3) * 10) / 10).toString() + ' EFLOPS';
  return (Math.round((val / 1e6) * 10) / 10).toString() + ' ZFLOPS';
}
