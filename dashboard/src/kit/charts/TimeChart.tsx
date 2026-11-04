import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { bandPath, gappedPath, nearestIndex, niceRange, niceTicks, useDismissOutside, useElementWidth } from "../lib/chart";
import { localDate, localMinutes, dayShort, hhmm, weekday } from "../lib/time";
import { fmt } from "../lib/format";
import { cn, clamp } from "../lib/utils";

/* Time-series chart for 15-minute data: one y-axis, thin lines, recessive grid, crosshair that
   snaps to the nearest period, one tooltip listing every visible series, arrow-key scrubbing.
   Dashed lines are only used for references (limits, clear sky, "now"). */

export interface Series {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  width?: number;
  dashed?: boolean;            // references only
  hideInTooltip?: boolean;
}

/** Filled area from zero (used for measured values: a different mark than the forecast lines). */
export interface Area { values: (number | null)[]; label: string }
export interface Band { lo: (number | null)[]; hi: (number | null)[]; label: string; color?: string }
export interface RefLine { value: number; label: string }
export interface Span { from: number; to: number; label?: string; tone?: "accent" | "warning" }

export function TimeChart({
  t, series, band, area, refLines = [], spans = [], tz, unit, digits = 1, height = 280, yMin, yMax, nowMs,
  shadeNight, ariaLabel, footer, onHover, minY0 = true,
}: {
  t: number[];
  series: Series[];
  band?: Band;
  area?: Area;
  refLines?: RefLine[];
  spans?: Span[];
  tz: string;
  unit: string;
  digits?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  nowMs?: number;
  shadeNight?: (number | null)[];   // clear-sky GHI: zero means night
  ariaLabel: string;
  footer?: ReactNode;
  onHover?: (i: number | null) => void;
  minY0?: boolean;
}) {
  const reduce = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(800);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const setH = useCallback((i: number | null) => { setHover(i); onHover?.(i); }, [onHover]);
  useDismissOutside(wrapRef, hover !== null, useCallback(() => setH(null), [setH]));

  const narrow = width < 520;
  const padL = narrow ? 38 : 48, padR = 12, padT = 24, padB = 30;
  const innerW = Math.max(10, width - padL - padR), innerH = height - padT - padB;
  const n = t.length;
  const t0 = t[0] ?? 0, t1 = (t[n - 1] ?? 1) + 15 * 60_000;

  const { ticks, lo, hi } = useMemo(() => {
    let mx = -Infinity, mn = Infinity;
    for (const s of series) for (const v of s.values) if (v != null) { if (v > mx) mx = v; if (v < mn) mn = v; }
    if (band) for (const v of band.hi) if (v != null && v > mx) mx = v;
    if (area) for (const v of area.values) if (v != null && v > mx) mx = v;
    for (const r of refLines) mx = Math.max(mx, r.value);
    if (!Number.isFinite(mx)) mx = 1;
    if (!Number.isFinite(mn)) mn = 0;
    if (yMax != null) mx = Math.max(mx, yMax);
    const ticks = minY0 && mn >= 0 ? niceTicks(mx * 1.04, narrow ? 3 : 4) : niceRange(yMin ?? mn, mx, narrow ? 3 : 4);
    return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] };
  }, [series, band, area, refLines, yMax, yMin, narrow, minY0]);

  const x = (ms: number) => padL + ((ms - t0) / (t1 - t0 || 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * innerH;
  const xs = useMemo(() => t.map((ms) => x(ms + 7.5 * 60_000)), [t, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const ys = (vals: (number | null)[]) => vals.map((v) => (v == null ? null : y(v)));

  // day boundaries and labels in the plant's time zone
  const days = useMemo(() => {
    const out: { ms: number; label: string }[] = [];
    let prev = "";
    t.forEach((ms) => {
      const d = localDate(ms, tz);
      if (d !== prev && localMinutes(ms, tz) < 15) out.push({ ms, label: narrow ? weekday(ms, tz) : dayShort(ms, tz) });
      prev = d;
    });
    return out;
  }, [t, tz, narrow]);
  const hourTicks = useMemo(() => {
    const spanDays = (t1 - t0) / 864e5;
    const every = spanDays <= 1.5 ? 180 : spanDays <= 3 ? 360 : 720;
    return t.filter((ms) => { const m = localMinutes(ms, tz); return m % every === 0 && m !== 0; });
  }, [t, tz, t0, t1]);
  const nights = useMemo(() => {
    if (!shadeNight) return [];
    const out: [number, number][] = [];
    let s: number | null = null;
    shadeNight.forEach((v, i) => {
      const dark = v != null && v <= 0;
      if (dark && s === null) s = t[i];
      if (!dark && s !== null) { out.push([s, t[i]]); s = null; }
    });
    if (s !== null) out.push([s, t1]);
    return out;
  }, [shadeNight, t, t1]);

  const pick = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !n) return;
    const ms = t0 + ((clientX - box.left - padL) / innerW) * (t1 - t0) - 7.5 * 60_000;
    setH(nearestIndex(t, clamp(ms, t0, t[n - 1])));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 4 : 1;
    if (e.key === "ArrowRight") setH(clamp((hover ?? -1) + step, 0, n - 1));
    else if (e.key === "ArrowLeft") setH(clamp((hover ?? n) - step, 0, n - 1));
    else if (e.key === "Home") setH(0);
    else if (e.key === "End") setH(n - 1);
    else if (e.key === "Escape") setH(null);
    else return;
    e.preventDefault();
  };

  const tipLeft = hover != null ? xs[hover] : 0;
  const tipRows = hover != null ? series.filter((s) => !s.hideInTooltip).map((s) => ({ s, v: s.values[hover] })) : [];

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setH(null)}
        onBlur={() => setH(null)}
        className="block touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      >
        {nights.map(([a, b], i) => (
          <rect key={i} x={x(a)} y={padT} width={Math.max(0, x(b) - x(a))} height={innerH} fill="var(--surface-raised)" opacity={0.75} />
        ))}
        {spans.map((s, i) => (
          <g key={i}>
            <rect x={x(s.from)} y={padT} width={Math.max(1, x(s.to) - x(s.from))} height={innerH}
              fill={s.tone === "warning" ? "color-mix(in srgb, var(--warning) 22%, transparent)" : "var(--accent-soft)"} />
            {s.label && !narrow && <text x={x(s.from) + 4} y={padT + 11} className="fill-[var(--text-secondary)] text-[10px]">{s.label}</text>}
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} stroke={v === lo ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="tabular fill-[var(--text-muted)] text-[10.5px]">{fmt(v, v % 1 ? 1 : 0)}</text>
          </g>
        ))}
        <text x={0} y={9} className="fill-[var(--text-muted)] text-[10px]">{unit}</text>
        {days.map((d) => (
          <g key={d.ms}>
            <line x1={x(d.ms)} x2={x(d.ms)} y1={padT} y2={padT + innerH + 4} stroke="var(--axis)" strokeWidth={1} />
            <text x={x(d.ms) + 4} y={height - 8} className="fill-[var(--text-secondary)] text-[11px] font-medium">{d.label}</text>
          </g>
        ))}
        {!narrow && hourTicks.map((ms) => (
          <text key={ms} x={x(ms)} y={height - 8} textAnchor="middle" className="tabular fill-[var(--text-muted)] text-[10px]">{hhmm(ms, tz)}</text>
        ))}

        {band && (
          <motion.path d={bandPath(xs, ys(band.lo), ys(band.hi))} fill={band.color ?? "var(--band)"}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />
        )}
        {area && (
          <path d={bandPath(xs, area.values.map((v) => (v == null ? null : y(Math.max(lo, 0)))), ys(area.values))} fill="var(--text-muted)" opacity={0.28} />
        )}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={padL} x2={padL + innerW} y1={y(r.value)} y2={y(r.value)} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} />
            <text x={padL + innerW - 2} y={y(r.value) - 5} textAnchor="end" className="fill-[var(--text-secondary)] text-[10.5px]">{r.label}</text>
          </g>
        ))}
        {series.map((s, i) => (
          <motion.path
            key={s.key}
            d={gappedPath(xs, ys(s.values))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 1.6}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ pathLength: { duration: 1, ease: [0.23, 1, 0.32, 1], delay: i * 0.06 }, opacity: { duration: 0.2 } }}
          />
        ))}
        {nowMs != null && nowMs > t0 && nowMs < t1 && (
          <g>
            <line x1={x(nowMs)} x2={x(nowMs)} y1={padT} y2={padT + innerH} stroke="var(--accent)" strokeDasharray="2 3" strokeWidth={1.25} />
            <text x={x(nowMs)} y={padT - 5} textAnchor="middle" className="fill-[var(--accent)] text-[10px] font-medium">now</text>
          </g>
        )}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={xs[hover]} x2={xs[hover]} y1={padT} y2={padT + innerH} stroke="var(--text-muted)" strokeWidth={1} />
            {tipRows.map(({ s, v }) => v != null && (
              <circle key={s.key} cx={xs[hover]} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute top-1 z-20 min-w-[168px] rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-elevated"
          style={{ left: clamp(tipLeft + (tipLeft > width * 0.6 ? -184 : 14), 0, Math.max(0, width - 180)) }}
        >
          <p className="mb-1 text-[11.5px] text-muted">{dayShort(t[hover], tz)} · {hhmm(t[hover], tz)}–{hhmm(t[hover] + 15 * 60_000, tz)}</p>
          {band && band.lo[hover] != null && (
            <p className="flex items-center justify-between gap-4 text-ink-2"><span>{band.label}</span><span className="tabular">{fmt(band.lo[hover], digits)}–{fmt(band.hi[hover], digits)}</span></p>
          )}
          {area && (
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block h-2.5 w-3 rounded-sm bg-[var(--text-muted)] opacity-50" />{area.label}</span>
              <span className="tabular font-semibold text-ink">{fmt(area.values[hover], digits)} <span className="text-muted">{unit}</span></span>
            </p>
          )}
          {tipRows.map(({ s, v }) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />{s.label}
              </span>
              <span className={cn("tabular", s.width && s.width > 2 ? "font-semibold text-ink" : "text-ink")}>{fmt(v, digits)} <span className="text-muted">{unit}</span></span>
            </p>
          ))}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {hover != null ? `${dayShort(t[hover], tz)} ${hhmm(t[hover], tz)}: ${tipRows.map(({ s, v }) => `${s.label} ${fmt(v, digits)} ${unit}`).join(", ")}` : ""}
      </p>
      {footer}
    </div>
  );
}
