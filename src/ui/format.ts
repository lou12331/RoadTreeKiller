const UNITS: [number, string][] = [
  [1e16, '京'],
  [1e12, '兆'],
  [1e8, '億'],
  [1e4, '萬'],
];

/** 中文大數字格式：12,345 → 1.23萬 */
export function fmt(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 100_000) {
    return n.toLocaleString('zh-TW', { maximumFractionDigits: n < 100 ? decimals : 0 });
  }
  for (const [v, u] of UNITS) {
    if (n >= v) {
      const x = n / v;
      return (x >= 1000 ? Math.floor(x).toLocaleString('zh-TW') : x.toFixed(x >= 100 ? 1 : 2)) + u;
    }
  }
  return Math.floor(n).toLocaleString('zh-TW');
}

export const fmtInt = (n: number) => Math.floor(n).toLocaleString('zh-TW');

export function fmtDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}
