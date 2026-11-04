import { useCallback, useMemo, useState } from "react";
import { niceTicks, useDismissOutside, useElementWidth } from "../kit/lib/chart";
import { fmt, pct } from "../kit/lib/format";
import { clamp } from "../kit/lib/utils";
import { METHOD_COLOR, curve, type CurveRow } from "../data";

/* Share of events caught against false alarms per turbine-year; one line per method,
   each dot one alarm threshold set on the training year, joined from the lowest threshold to the highest. Up and to the left is better. */
export function TradeoffChart({ metric, ariaLabel }: { metric: "outage_share" | "temp_alarm_share"; ariaLabel: string }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<CurveRow | null>(null);
  useDismissOutside(wrapRef, hover !== null, useCallback(() => setHover(null), []));
  const height = 230, padL = 40, padR = 12, padT = 12, padB = 40;
  const innerW = Math.max(10, width - padL - padR), innerH = height - padT - padB;
  const xTicks = useMemo(() => niceTicks(Math.max(...curve.map((r) => r.false_alarms_per_turbine_year)), width < 360 ? 3 : 5), [width]);
  const xMax = xTicks[xTicks.length - 1];
  const x = (v: number) => padL + (v / xMax) * innerW;
  const y = (v: number) => padT + (1 - v) * innerH;
  const modes = ["fleet", "self", "baseline"] as const;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} />
            <text x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="tabular fill-[var(--text-muted)] text-[10.5px]">{pct(v * 100)}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={padT + innerH + 15} textAnchor="middle" className="tabular fill-[var(--text-muted)] text-[10.5px]">{fmt(v, 0)}</text>
        ))}
        <text x={padL + innerW} y={height - 4} textAnchor="end" className="fill-[var(--text-secondary)] text-[11px]">False alarms per turbine-year</text>
        {modes.map((m) => {
          const pts = curve.filter((r) => r.mode === m).sort((a, b) => a.quantile - b.quantile); // in threshold order
          const d = "M" + pts.map((p) => `${x(p.false_alarms_per_turbine_year).toFixed(1)} ${y(p[metric]).toFixed(1)}`).join("L");
          return (
            <g key={m}>
              <path d={d} fill="none" stroke={METHOD_COLOR[m]} strokeWidth={m === "fleet" ? 2.2 : 1.6} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => (
                <circle key={p.quantile} cx={x(p.false_alarms_per_turbine_year)} cy={y(p[metric])} r={hover === p ? 5 : 3.5}
                  fill={METHOD_COLOR[m]} stroke="var(--surface)" strokeWidth={1.5}
                  onPointerEnter={() => setHover(p)} onPointerDown={() => setHover(p)} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-20 w-[200px] rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-elevated"
          style={{ left: clamp(x(hover.false_alarms_per_turbine_year) + 10, 0, Math.max(0, width - 204)), top: clamp(y(hover[metric]) - 70, 0, height - 80) }}>
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><span className="inline-block h-0.5 w-3 rounded-full" style={{ background: METHOD_COLOR[hover.mode] }} />{hover.method}</p>
          <p className="flex justify-between gap-3 text-ink-2"><span>Caught</span><span className="tabular text-ink">{pct(hover[metric] * 100)}</span></p>
          <p className="flex justify-between gap-3 text-ink-2"><span>False alarms</span><span className="tabular text-ink">{fmt(hover.false_alarms_per_turbine_year, 1)} / yr</span></p>
          <p className="mt-1 text-[11px] text-muted">Threshold: {fmt(hover.quantile * 100, 1)}th percentile of training scores</p>
        </div>
      )}
    </div>
  );
}
