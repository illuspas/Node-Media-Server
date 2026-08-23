import { getLocale, t } from "../i18n";

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

/** Format seconds as h:mm:ss / m:ss. Non-finite input formats as zero. */
export function fmtDur(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Long-form duration for status lines: "3 天 4 小时" / "3 d 4 h" / m:ss. */
export function fmtDurLong(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} ${t("time.day")} ${hours} ${t("time.hour")}`;
  if (hours > 0) return `${hours} ${t("time.hour")} ${mins} ${t("time.minute")}`;
  return fmtDur(total);
}

/** Locale-aware date-time string following the active UI locale. */
export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(getLocale() === "zh-CN" ? "zh-CN" : "en-US", { hour12: false });
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
