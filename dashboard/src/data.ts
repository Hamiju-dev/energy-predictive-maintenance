import curveJson from "./data/curve.json";
import eventsJson from "./data/events.json";
import healthJson from "./data/health.json";
import screeningJson from "./data/screening.json";
import summaryJson from "./data/summary.json";

/* Results of `python -m predmaint run` (fleet model, trained on 2012, tested on 2013–14),
   exported by scripts/export_dashboard_data.py. */

export interface HealthRow { turbine: string; date: string; component: string; score: number; alarm: number }
export interface EventRow {
  id: string; turbine: string; component: string; kind: "Temperature alarm" | "Major outage";
  start: string; end: string; scope: "Fleet-wide" | "Turbine-specific";
  warned: "Warned" | "Missed" | "Not scorable" | "Training period"; lead_days: number | null; description: string;
}
export interface ScreeningRow { component: string; turbine: string; offset_c: number }
export interface SummaryRow {
  mode: "fleet" | "self" | "baseline"; method: string;
  outages_warned: number; outages_scorable: number; outage_lead_days: number | null;
  temp_alarms_warned: number; temp_alarms_scorable: number; temp_lead_days: number | null;
  false_alarms_per_turbine_year: number;
}
export interface CurveRow {
  mode: SummaryRow["mode"]; method: string; quantile: number;
  false_alarms_per_turbine_year: number; outage_share: number; temp_alarm_share: number;
}

export const health = healthJson as HealthRow[];
export const events = eventsJson as EventRow[];
export const screening = screeningJson as ScreeningRow[];
export const summary = summaryJson as SummaryRow[];
export const curve = curveJson as CurveRow[];

export const TURBINES = ["T80", "T81", "T82", "T83", "T84"] as const;
export const COMPONENTS = ["gearbox", "main bearing", "generator", "transformer", "converter"] as const;
export type Turbine = (typeof TURBINES)[number];
export type Component = (typeof COMPONENTS)[number];

export const TRAIN_END = Date.parse("2013-01-01");
export const RANGE: [number, number] = [Date.parse("2012-01-01"), Date.parse("2015-01-01")];
export const DAY = 864e5;

/** Series colour per method: colour follows the method in every chart. */
export const METHOD_COLOR: Record<SummaryRow["mode"], string> = {
  fleet: "var(--m-ifs)",
  self: "var(--m-aifs)",
  baseline: "var(--m-gfs)",
};

export interface DayPoint { t: number; score: number }

/** Daily scores of one turbine and component, oldest first. */
export function series(turbine: string, component: string): DayPoint[] {
  return health
    .filter((r) => r.turbine === turbine && r.component === component)
    .map((r) => ({ t: Date.parse(r.date), score: r.score }))
    .sort((a, b) => a.t - b.t);
}

/** The pipeline's alarm rule: above k on 2+ scored days in a row (data gaps of up to 3 days allowed). */
export function alarmFlags(points: DayPoint[], k: number): boolean[] {
  let run = 0;
  return points.map((p, i) => {
    const gap = i === 0 ? 1 : (p.t - points[i - 1].t) / DAY;
    run = p.score > k ? (gap <= 3 ? run + 1 : 1) : 0;
    return run >= 2;
  });
}

/** Alarm days and separate alarm episodes (gaps of more than 4 days start a new one) from a date on. */
export function alarmStats(points: DayPoint[], flags: boolean[], from: number) {
  let days = 0, episodes = 0, last: number | null = null;
  points.forEach((p, i) => {
    if (p.t < from || !flags[i]) return;
    days += 1;
    if (last === null || (p.t - last) / DAY > 4) episodes += 1;
    last = p.t;
  });
  return { days, episodes };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (t: number | string) => dateFmt.format(typeof t === "number" ? t : Date.parse(t));
export const fmtMonth = (t: number) => monthFmt.format(t);
