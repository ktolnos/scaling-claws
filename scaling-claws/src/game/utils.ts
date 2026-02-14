const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q'];

export function formatNumber(n: number): string {
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) return n < 10 ? n.toFixed(1) : Math.floor(n).toString();

  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }

  if (tier >= SUFFIXES.length) {
    return n.toExponential(2);
  }

  return (scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1) : Math.floor(scaled).toString()) + SUFFIXES[tier];
}

export function formatMoney(n: number): string {
  if (n < 0) return '-$' + formatNumber(-n);
  return '$' + formatNumber(n);
}

export function formatRate(perMin: number): string {
  if (perMin >= 0) return '+' + formatMoney(perMin) + '/min';
  return '-' + formatMoney(-perMin) + '/min';
}

export function formatTime(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return totalSec + 's';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? min + 'm ' + sec + 's' : min + 'm';
}

export function formatFlops(flops: number): string {
  if (flops < 1e3) return flops.toFixed(1) + ' PFLOPS';
  if (flops < 1e6) return (flops / 1e3).toFixed(1) + ' EFLOPS';
  return (flops / 1e6).toFixed(1) + ' ZFLOPS';
}
