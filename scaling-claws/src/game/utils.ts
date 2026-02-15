const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Q'];

export function formatNumber(n: number): string {
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) return (Math.round(n * 10) / 10).toString();

  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }

  if (tier >= SUFFIXES.length) {
    return n.toExponential(1);
  }

  return (Math.round(scaled * 10) / 10).toString() + SUFFIXES[tier];
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

export function formatMW(mw: number): string {
  if (mw < 1) return Math.round(mw * 1000).toString() + ' kW';
  if (mw < 1000) return (Math.round(mw * 10) / 10).toString() + ' MW';
  return (Math.round((mw / 1000) * 10) / 10).toString() + ' GW';
}

export function formatFlops(flops: number): string {
  if (flops < 1e3) return (Math.round(flops * 10) / 10).toString() + ' PFLOPS';
  if (flops < 1e6) return (Math.round((flops / 1e3) * 10) / 10).toString() + ' EFLOPS';
  return (Math.round((flops / 1e6) * 10) / 10).toString() + ' ZFLOPS';
}
