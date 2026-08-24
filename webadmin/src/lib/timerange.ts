/* Shared date-range filter helpers used by the history and records pages. */

/** date-range presets, resolved against "now" on every load (incl. polling) */
export type RangeValue = "today" | "7d" | "30d" | "custom";

/** Local-time YYYY-MM-DD for a Date / ms timestamp. */
export function toDateInput(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The [startDay, endDay] pair a preset currently maps to, for the date boxes. */
export function presetDates(value: Exclude<RangeValue, "custom">): { start: string; end: string } {
  const now = new Date();
  if (value === "today") {
    const today = toDateInput(now);
    return { start: today, end: today };
  }
  const days = Number(value.slice(0, -1));
  return { start: toDateInput(now.getTime() - days * 24 * 3600 * 1000), end: toDateInput(now) };
}

/** Inclusive [start, end] ms window in local time for a preset. */
export function rangeWindow(
  value: RangeValue,
  customStart: string,
  customEnd: string,
): { start?: number; end?: number } {
  if (value === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`).getTime() : undefined;
    const end = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : undefined;
    return {
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(end) ? end : undefined,
    };
  }
  const { start: startDay, end: endDay } = presetDates(value);
  return {
    start: new Date(`${startDay}T00:00:00`).getTime(),
    end: new Date(`${endDay}T23:59:59.999`).getTime(),
  };
}
