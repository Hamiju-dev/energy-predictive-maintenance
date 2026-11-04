import { nowMs } from "./clock";

/** Times in the plant's own time zone (the API sends UTC milliseconds or ISO strings). */

const fmts = new Map<string, Intl.DateTimeFormat>();
function f(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  if (!fmts.has(key)) fmts.set(key, new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }));
  return fmts.get(key)!;
}

export const toMs = (t: number | string) => (typeof t === "number" ? t : Date.parse(t));

export const hhmm = (t: number | string, tz: string) => f(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toMs(t));
export const dayShort = (t: number | string, tz: string) => f(tz, { weekday: "short", day: "numeric", month: "short" }).format(toMs(t));
export const weekday = (t: number | string, tz: string) => f(tz, { weekday: "short" }).format(toMs(t));
export const dateTime = (t: number | string, tz: string) =>
  f(tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toMs(t));

/** Local calendar date "YYYY-MM-DD" of a time in a zone. */
export const localDate = (t: number | string, tz: string) => {
  const p = f(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(toMs(t));
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
};

/** Minutes after local midnight. */
export const localMinutes = (t: number | string, tz: string) => {
  const p = f(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(toMs(t));
  return Number(p.find((x) => x.type === "hour")?.value) * 60 + Number(p.find((x) => x.type === "minute")?.value);
};

/** "Thu 6 Nov" for a "YYYY-MM-DD" local date. */
export const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));

export const relative = (t: number | string) => {
  const h = (nowMs() - toMs(t)) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
