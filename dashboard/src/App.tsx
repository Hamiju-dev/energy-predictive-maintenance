import { Activity, Github, Thermometer, Wind } from "lucide-react";
import { useMemo, useState } from "react";
import { HealthChart } from "./components/HealthChart";
import { ScreeningMap } from "./components/ScreeningMap";
import { TradeoffChart } from "./components/TradeoffChart";
import {
  COMPONENTS, METHOD_COLOR, TRAIN_END, TURBINES, alarmFlags, alarmStats, events, fmtDate, series, summary,
  type Component, type EventRow, type Turbine,
} from "./data";
import { AnimatedNumber } from "./kit/ui/animated-number";
import { Badge, type BadgeTone } from "./kit/ui/badge";
import { Card } from "./kit/ui/card";
import { Segmented } from "./kit/ui/segmented";
import { Select } from "./kit/ui/select";
import { Tip } from "./kit/ui/tooltip";
import { fmt } from "./kit/lib/format";

const fleet = summary.find((s) => s.mode === "fleet")!;
const DAYS = (e: EventRow) => Math.round((Date.parse(e.end) - Date.parse(e.start)) / 864e5);
// the longest test-period outage, to name in the warning-time tile
const longest = events
  .filter((e) => e.kind === "Major outage" && Date.parse(e.start) >= TRAIN_END && e.warned !== "Not scorable")
  .sort((a, b) => DAYS(b) - DAYS(a))[0];
const scorableEvents = events.filter((e) => e.warned === "Warned" || e.warned === "Missed").length;
const COMPONENT_HINT: Record<Component, string> = {
  gearbox: "7 sensors: bearings, oil, housing",
  "main bearing": "2 bearing sensors",
  generator: "Windings, bearings, cooling water",
  transformer: "1 sensor",
  converter: "Heat sink, cooling water",
};

export function App() {
  const [turbine, setTurbine] = useState<Turbine>("T81");
  const [component, setComponent] = useState<Component>("gearbox");
  const [k, setK] = useState(1);

  const points = useMemo(() => series(turbine, component), [turbine, component]);
  const flags = useMemo(() => alarmFlags(points, k), [points, k]);
  const stats = useMemo(() => alarmStats(points, flags, TRAIN_END), [points, flags]);
  const chartEvents = useMemo(
    () => events.filter((e) => e.turbine === turbine && (e.component === component || e.kind === "Major outage")),
    [turbine, component],
  );
  const turbineEvents = useMemo(() => events.filter((e) => e.turbine === turbine).sort((a, b) => b.start.localeCompare(a.start)), [turbine]);

  const pick = (t: string, c: string) => {
    setTurbine(t as Turbine);
    setComponent(c as Component);
    document.getElementById("health")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-full bg-bg pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] text-ink sm:pr-[max(28px,env(safe-area-inset-right,0px))] sm:pl-[max(28px,env(safe-area-inset-left,0px))]">
      <main className="mx-auto flex max-w-[1240px] flex-col gap-5 py-6 sm:py-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" dot>Fleet model</Badge>
            <Badge>Fuhrländer FL2500 · 5 turbines</Badge>
            <Badge>Trained 2012 · tested 2013–14</Badge>
          </div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance sm:text-[34px]">Turbine Health Monitor</h1>
          <p className="max-w-[68ch] text-[14px] leading-relaxed text-ink-2">
            Each component's temperature is compared with what a healthy sister turbine would show in the same wind,
            load and weather. A score that stays above the alarm level flags a developing fault, weeks before the
            turbine's own alarm or a breakdown.
          </p>
        </header>

        <section aria-label="Headline results" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Activity className="size-4" />} title="Outages warned" meta="test 2013–14"
            info="Turbine down for 5 days or more while its sister turbines ran. Warned = an alarm in the 30 days before."
            value={<><AnimatedNumber value={fleet.outages_warned} format={(n) => fmt(n, 0)} /><span className="text-muted"> of {fleet.outages_scorable}</span></>}
            foot={fleet.outages_warned === fleet.outages_scorable
              ? <Badge tone="good" dot>All warned</Badge>
              : <Badge tone="critical" dot>{`${fleet.outages_scorable - fleet.outages_warned} missed`}</Badge>} />
          <Kpi icon={<Activity className="size-4" />} title="Warning time" meta="median, outages"
            info="Days between the first alarm and the start of the outage, counting back at most 30 days."
            value={<><AnimatedNumber value={fleet.outage_lead_days ?? 0} format={(n) => fmt(n, 0)} /><span className="text-[18px] text-muted"> days</span></>}
            foot={longest && <span className="text-[12px] text-muted">{`${longest.turbine}'s ${DAYS(longest)}-day outage: ${longest.warned === "Warned" ? `${fmt(longest.lead_days, 0)} days` : "missed"}`}</span>} />
          <Kpi icon={<Thermometer className="size-4" />} title="Overheating warned" meta="single turbine"
            info="The controller's own high-temperature alarms that only this turbine raised. Fleet-wide hot-day trips are a cooling limit, not a fault, and are left out here."
            value={<><AnimatedNumber value={fleet.temp_alarms_warned} format={(n) => fmt(n, 0)} /><span className="text-muted"> of {fleet.temp_alarms_scorable}</span></>}
            foot={<span className="text-[12px] text-muted">median {fmt(fleet.temp_lead_days, 0)} days before the alarm</span>} />
          <Kpi icon={<Wind className="size-4" />} title="False alarms" meta="per turbine-year"
            info="Alarm episodes across all 5 monitored components that were not followed by a fault within 30 days."
            value={<AnimatedNumber value={fleet.false_alarms_per_turbine_year} format={(n) => fmt(n, 1)} />}
            foot={<span className="text-[12px] text-muted">{`about one check every ${fmt(52 / fleet.false_alarms_per_turbine_year, 0)} weeks per turbine`}</span>} />
        </section>

        <Card id="health" title="Health score" meta={`${turbine} · ${component}`}
          info="Measured minus expected temperature, standardised, averaged per day over the component's sensors, minus the fleet's daily median, and smoothed. 1.0 is the alarm level set on the 2012 training year; an alarm needs 2 days in a row above it."
          actions={<Badge tone={stats.days ? "warning" : "neutral"} dot={stats.days > 0}>{`${stats.days} alarm days · ${stats.episodes} episodes in 2013–14`}</Badge>}>
          <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3">
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-ink-2">Turbine</p>
              <Segmented label="Turbine" value={turbine} onChange={setTurbine} options={TURBINES.map((t) => ({ value: t, label: t }))} />
            </div>
            <Select label="Component" className="w-56" value={component} onChange={setComponent}
              options={COMPONENTS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1), description: COMPONENT_HINT[c] }))} />
            <div className="min-w-[200px] flex-1 sm:max-w-[320px]">
              <label htmlFor="k" className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink-2">
                <span>Alarm level</span><span className="tabular text-ink">×{fmt(k, 1)}</span>
              </label>
              <input id="k" type="range" min={0.5} max={2} step={0.1} value={k} onChange={(e) => setK(Number(e.target.value))}
                className="range focus-ring h-9 w-full cursor-pointer" aria-valuetext={`${fmt(k, 1)} times the calibrated alarm level`} />
            </div>
          </div>
          <HealthChart points={points} flags={flags} k={k} events={chartEvents} ariaLabel={`Daily health score of ${turbine} ${component}, 2012 to 2014`} />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px] text-muted">
            <Legend swatch={<span className="h-0.5 w-3.5 rounded-full bg-[var(--m-ifs)]" />}>Health score</Legend>
            <Legend swatch={<span className="w-3.5 border-t border-dashed border-[var(--text-muted)]" />}>Alarm level</Legend>
            <Legend swatch={<span className="h-3 w-0.5 bg-critical" />}>Fault event</Legend>
            <Legend swatch={<span className="size-2.5 rounded-[2px] bg-warning" />}>Alarm day</Legend>
            <span>Gap June–Nov 2013: no SCADA data</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Card title="Fleet screening" meta="°C vs sister turbines, 2012"
            info="Each turbine's typical offset from the model in the training year. It answers which turbine is different from day one; the health score above answers which one is changing.">
            <ScreeningMap turbine={turbine} component={component} onPick={pick} />
          </Card>
          <Card title="Fault events" meta={turbine}
            info="Controller high-temperature alarms and major outages. Warned = an alarm in the 30 days before; not scorable = too little SCADA data in that window.">
            <EventList rows={turbineEvents} />
          </Card>
        </div>

        <Card title="Method comparison" meta="test 2013–14"
          info="The same alarm logic with three kinds of expected value: sister turbines (fleet), the turbine's own 2012 behaviour (self), and a plain average temperature (no model).">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted">
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 text-right font-medium">Outages warned</th>
                  <th className="py-2 pr-3 text-right font-medium">Median lead</th>
                  <th className="py-2 pr-3 text-right font-medium">Turbine-specific alarms warned</th>
                  <th className="py-2 text-right font-medium">False alarms / turbine-year</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.mode} className="border-t border-line">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2 font-medium"><span className="h-0.5 w-3.5 rounded-full" style={{ background: METHOD_COLOR[s.mode] }} />{s.method}</span>
                    </td>
                    <td className="tabular py-2.5 pr-3 text-right">{s.outages_warned} of {s.outages_scorable}</td>
                    <td className="tabular py-2.5 pr-3 text-right">{s.outage_lead_days == null ? "–" : `${fmt(s.outage_lead_days, 0)} days`}</td>
                    <td className="tabular py-2.5 pr-3 text-right">{s.temp_alarms_warned} of {s.temp_alarms_scorable}</td>
                    <td className="tabular py-2.5 text-right">{fmt(s.false_alarms_per_turbine_year, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[13px] font-medium text-ink">Outages caught vs false alarms</h3>
              <p className="mb-3 text-[12px] text-muted">Each dot is one alarm level, joined from low to high. Up and to the left is better.</p>
              <TradeoffChart metric="outage_share" ariaLabel="Share of major outages warned against false alarms per turbine-year, per method" />
            </div>
            <div>
              <h3 className="mb-1 text-[13px] font-medium text-ink">Temperature alarms caught vs false alarms</h3>
              <p className="mb-3 text-[12px] text-muted">All scorable controller alarms, fleet-wide hot-day trips included.</p>
              <TradeoffChart metric="temp_alarm_share" ariaLabel="Share of temperature alarms warned against false alarms per turbine-year, per method" />
            </div>
          </div>
        </Card>

        <footer className="flex flex-col gap-1.5 pb-4 text-[12px] leading-relaxed text-muted">
          <p>Data: Fuhrländer FL2500 wind farm SCADA and alarm log, 2012–2014, by Alejandro Blanco-M., Eclipse Public License 2.0. {scorableEvents} scorable test events, so treat the rates as indicative.</p>
          <p className="flex items-center gap-1.5">
            <Github className="size-3.5" />
            <a className="underline decoration-[var(--border-hover)] underline-offset-2 hover:text-ink" href="https://github.com/Hamiju-dev/energy-predictive-maintenance" target="_blank" rel="noreferrer">
              Code and method: energy-predictive-maintenance
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function Kpi({ icon, title, meta, info, value, foot }: {
  icon: React.ReactNode; title: string; meta: string; info: string; value: React.ReactNode; foot: React.ReactNode;
}) {
  return (
    <Card title={<span className="flex items-center gap-1.5"><span className="text-muted">{icon}</span>{title}</span>} meta={meta} info={info}>
      <div className="flex h-full flex-col justify-between gap-3">
        <p className="text-[32px] leading-none font-semibold tracking-tight">{value}</p>
        <div>{foot}</div>
      </div>
    </Card>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5">{swatch}{children}</span>;
}

const RESULT_TONE: Record<EventRow["warned"], BadgeTone> = {
  Warned: "good",
  Missed: "critical",
  "Not scorable": "neutral",
  "Training period": "neutral",
};

function EventList({ rows }: { rows: EventRow[] }) {
  if (!rows.length) return <p className="text-[13px] text-muted">No fault events for this turbine.</p>;
  return (
    <ul className="max-h-[380px] divide-y divide-[var(--border)] overflow-y-auto pr-1">
      {rows.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className={e.kind === "Major outage" ? "font-semibold text-critical" : "font-medium text-ink"}>{e.kind}</span>
              <span className="text-ink-2 capitalize">{e.component}</span>
              <span className="tabular text-[12px] text-muted">{fmtDate(e.start)}</span>
            </p>
            <Tip content={e.description} side="bottom" wide className="flex max-w-full">
              <span tabIndex={0} className="focus-ring mt-0.5 block max-w-full truncate rounded text-[12px] text-muted">
                {e.scope} · {e.description}
              </span>
            </Tip>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={RESULT_TONE[e.warned]} dot={e.warned === "Warned" || e.warned === "Missed"}>{e.warned}</Badge>
            {e.warned === "Warned" && e.lead_days != null && <span className="tabular text-[11.5px] text-muted">{fmt(e.lead_days, 0)} days ahead</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
