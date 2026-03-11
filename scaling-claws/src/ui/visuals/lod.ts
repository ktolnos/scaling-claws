export interface LodSplit {
  directCount: number;
  overflowDensity: number;
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function smoothstep01(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - (2 * x));
}

export function splitDirectAndDensity(totalCount: number, directCap: number, maxDensityCount: number): LodSplit {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return { directCount: 0, overflowDensity: 0 };
  }

  const safeTotal = Math.max(0, Math.floor(totalCount));
  const safeDirectCap = Math.max(0, Math.floor(directCap));
  const safeDensityCap = Math.max(safeDirectCap + 1, Math.floor(maxDensityCount));

  const directCount = Math.min(safeTotal, safeDirectCap);
  const overflow = Math.max(0, safeTotal - safeDirectCap);
  const overflowSpan = Math.max(1, safeDensityCap - safeDirectCap);

  const normalizedOverflow = Math.log1p(overflow) / Math.log1p(overflowSpan);
  return {
    directCount,
    overflowDensity: smoothstep01(normalizedOverflow),
  };
}
