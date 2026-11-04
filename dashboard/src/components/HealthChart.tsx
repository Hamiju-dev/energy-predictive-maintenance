import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import { gappedPath, nearestIndex, niceRange, useDismissOutside, useElementWidth } from "../kit/lib/chart";
import { fmt } from "../kit/lib/format";
import { clamp } from "../kit/lib/utils";
import { DAY, RANGE, TRAIN_END, fmtDate, fmtMonth, type DayPoint, type EventRow } from "../data";

/* Daily health score over three years, in the kit's chart style: one y-axis, thin line,
   recessive grid, a dashed reference line only for the alarm level, crosshair tooltip and
   arrow-key reading. Alarm days sit in a strip under the plot; fault events are red lines,
   outages red spans. */
export function HealthChart({ points, flags, k, events, ariaLabel }: {
  points: DayPoint[]; flags: boolean[]; k: number; events: EventRow[]; ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(900);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useDismissOutside(wrapRef, hover !== null, useCallback(() => setHover(null), []));

  const narrow = width < 560;
  const height = narrow ? 300 : 340;
  const padL = 40, padR = narrow ? 12 : 92, padT = 22, stripH = 18, padB = 28;
  const plotH = height - padT - stripH - padB - 8;
  const innerW = Math.max(10, width - padL - padR);
  const [t0, t1] = RANGE;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * innerW;

  const ticks = useMemo(() => {
    let mn = -1, mx = Math.max(2, k * 1.25);
    for (const p of points) { if (p.score < mn) mn = p.score; if (p.score > mx) mx = p.score; }
    return niceRange(mn, mx, narrow ? 4 : 5);
  }, [points, k, narrow]);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  const xs = points.map((p) => x(p.t + DAY / 2));
  // break the line where data is missing for more than 3 days
  const gapped: (number | null)[] = [];
  const gx: number[] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.t - points[i - 1].t > 3 * DAY) { gapped.push(null); gx.push(xs[i]); }
    gapped.push(y(p.score));
    gx.push(xs[i]);
  });

  const months = useMemo(() => {
    const out: number[] = [];
    const step = narrow ? 12 : 6;
    for (let yr = 2012; yr <= 2014; yr++) for (let m = 0; m < 12; m += step) out.push(Date.UTC(yr, m, 1));
    return out;
  }, [narrow]);

  const pick = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !points.length) return;
    const t = t0 + ((clientX - box.left - padL) / innerW) * (t1 - t0) - DAY / 2;
    const i = nearestIndex(points.map((p) => p.t), clamp(t, points[0].t, points[points.length - 1].t));
    setHover(Math.abs(points[i].t - t) <= 6 * DAY ? i : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = points.length, step = e.shiftKey ? 7 : 1;
    if (e.key === "ArrowRight") setHover(clamp((hover ?? -1) + step, 0, n - 1));
    else if (e.key === "ArrowLeft") setHover(clamp((hover ?? n) - step, 0, n - 1));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(n - 1);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const hp = hover != null ? points[hover] : null;
  const near = hp ? events.filter((ev) => Math.abs(Date.parse(ev.start) - hp.t) <= 3 * DAY) : [];
  const dayW = Math.max(1.5, innerW / ((t1 - t0) / DAY));
  const lineKey = `${ariaLabel}`;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg ref={svgRef} width={width} height={height} role="img" tabIndex={0}
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
        onKeyDown={onKey}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        onBlur={() => setHover(null)}
        className="block touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]">
        {/* training year */}
        <rect x={x(t0)} y={padT} width={x(TRAIN_END) - x(t0)} height={plotH} fill="var(--surface-raised)" />
        <text x={x(t0) + 6} y={padT + 13} className="fill-[var(--text-secondary)] text-[10.5px]">Training year</text>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="tabular fill-[var(--text-muted)] text-[10.5px]">{fmt(v, v % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {months.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={padT + plotH} y2={padT + plotH + 4} stroke="var(--axis)" />
            <text x={x(t) + 3} y={height - 8} className="fill-[var(--text-secondary)] text-[11px]">{fmtMonth(t)}</text>
          </g>
        ))}

        {/* fault events */}
        {events.map((ev) => {
          const s = Date.parse(ev.start), e = Date.parse(ev.end);
          return (
            <g key={ev.id}>
              {ev.kind === "Major outage" && (
                <rect x={x(s)} y={padT} width={Math.max(2, x(e) - x(s))} height={plotH} fill="color-mix(in srgb, var(--critical) 12%, transparent)" />
              )}
              <line x1={x(s)} x2={x(s)} y1={padT} y2={padT + plotH} stroke="var(--critical)" strokeWidth={1.25} />
            </g>
          );
        })}

        {/* alarm level */}
        <line x1={padL} x2={padL + innerW} y1={y(k)} y2={y(k)} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} />
        {narrow ? (
          <text x={padL + innerW - 2} y={y(k) - 5} textAnchor="end" className="fill-[var(--text-secondary)] text-[10.5px]">Alarm level ×{fmt(k, 1)}</text>
        ) : (
          <text x={padL + innerW + 8} y={y(k)} dominantBaseline="middle" className="fill-[var(--text-secondary)] text-[10.5px]">Alarm level ×{fmt(k, 1)}</text>
        )}

        <motion.path key={lineKey} d={gappedPath(gx, gapped)} fill="none" stroke="var(--m-ifs)" strokeWidth={1.6}
          strokeLinejoin="round" strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ pathLength: { duration: 1, ease: [0.23, 1, 0.32, 1] }, opacity: { duration: 0.2 } }} />

        {/* alarm strip */}
        <text x={padL - 6} y={padT + plotH + 8 + stripH / 2} textAnchor="end" dominantBaseline="middle" className="fill-[var(--text-muted)] text-[10px]">Alarm</text>
        <rect x={padL} y={padT + plotH + 8} width={innerW} height={stripH} rx={3} fill="var(--surface-raised)" />
        {points.map((p, i) => flags[i] && (
          <rect key={p.t} x={x(p.t)} y={padT + plotH + 10} width={dayW} height={stripH - 4} fill="var(--warning)" />
        ))}

        {hp && (
          <g pointerEvents="none">
            <line x1={xs[hover!]} x2={xs[hover!]} y1={padT} y2={padT + plotH} stroke="var(--text-muted)" strokeWidth={1} />
            <circle cx={xs[hover!]} cy={y(hp.score)} r={4} fill="var(--m-ifs)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hp && (
        <div className="pointer-events-none absolute top-1 z-20 w-[220px] rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-elevated"
          style={{ left: clamp(xs[hover!] + (xs[hover!] > width * 0.6 ? -234 : 14), 0, Math.max(0, width - 224)) }}>
          <p className="mb-1 text-[11.5px] text-muted">{fmtDate(hp.t)}</p>
          <p className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block h-0.5 w-3 rounded-full bg-[var(--m-ifs)]" />Health score</span>
            <span className="tabular font-semibold text-ink">{fmt(hp.score, 2)}</span>
          </p>
          {flags[hover!] && (
            <p className="mt-1 flex items-center gap-1.5 text-warning-text"><span className="inline-block size-2 rounded-[2px] bg-warning" />Alarm active</p>
          )}
          {near.map((ev) => (
            <p key={ev.id} className="mt-1.5 border-t border-line pt-1.5 text-ink-2">
              <span className="font-medium text-critical">{ev.kind}</span> · {ev.component}<br />
              <span className="text-[11.5px] text-muted">{ev.description}</span>
            </p>
          ))}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {hp ? `${fmtDate(hp.t)}: health score ${fmt(hp.score, 2)}${flags[hover!] ? ", alarm active" : ""}` : ""}
      </p>
    </div>
  );
}
