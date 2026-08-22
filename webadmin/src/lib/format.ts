/** Random float in [min, max). */
export function rnd(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Random integer in [min, max]. */
export function rndInt(min: number, max: number): number {
  return Math.floor(rnd(min, max + 1));
}

/** Format a number with zh-CN grouping, e.g. 5127 -> "5,127". */
export function fmtNum(n: number): string {
  return Number(n).toLocaleString("zh-CN");
}

/** Format seconds as h:mm:ss / m:ss. */
export function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Current local time as HH:mm. */
export function nowHM(): string {
  return new Date().toTimeString().slice(0, 5);
}

/** Format bytes as a human-readable string, e.g. 1048576 -> "1.0 MB". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
