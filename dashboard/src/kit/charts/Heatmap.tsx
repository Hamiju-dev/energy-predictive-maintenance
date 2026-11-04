import { useCallback, useMemo, useRef, useState } from "react";
import { useDismissOutside, useElementWidth } from "../lib/chart";
import { dateLabel, localDate, localMinutes } from "../lib/time";
import { fmt } from "../lib/format";
import { clamp } from "../lib/utils";

/* Days x quarter-hours of blend power (adapted from the EasyUI activity-heatmap "hours" mode).
   Colour is a single-hue sequential ramp with ABSOLUTE steps (share of the AC limit), so two days
   compare honestly; the original used quartiles of the data, which shifts with every forecast. */
const STEPS = 7;

export function Heatmap({ t, values, tz, capacity, unit, div }: {
  t: number[]; values: (number | null)[]; tz: string; capacity: number; unit: string; div: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  useDismissOutside(wrap, active !== null, useCallback(() => setActive(null), []));

  const grid = useMemo(() => {
    const rows = new Map<string, (number | null)[]>();
    let first = 96, last = 0;
    t.forEach((ms, i) => {
      const d = localDate(ms, tz);
      const c = Math.floor(localMinutes(ms, tz) / 15);
      if (!rows.has(d)) rows.set(d, Array(96).fill(undefined));
      rows.get(d)![c] = values[i];
      if ((values[i] ?? 0) > 0) { first = Math.min(first, c); last = Math.max(last, c); }
    });
    first = Math.max(0, Math.floor((first - 2) / 4) * 4);
    last = Math.min(95, Math.ceil((last + 3) / 4) * 4 - 1);
    return { days: [...rows.keys()], cells: [...rows.values()], first, last };
  }, [t, values, tz]);

  const cols = grid.last - grid.first + 1;
  const narrow = width < 520;
  const LW = narrow ? 44 : 84, TOP = 18, gap = 1;
  const cw = Math.max(2, (width - LW - (cols - 1) * gap) / cols);
  const ch = narrow ? 18 : 30;
  const h = TOP + grid.days.length * (ch + 3);
  const level = (v: number | null | undefined) => (v == null ? -1 : v <= 0 ? 0 : clamp(Math.ceil((v / capacity) * STEPS), 1, STEPS));
  const cur = active ? grid.cells[active.r][grid.first + active.c] : undefined;
  const minuteLabel = (c: number) => `${String(Math.floor((c * 15) / 60)).padStart(2, "0")}:${String((c * 15) % 60).padStart(2, "0")}`;

  return (
    <div ref={ref} className="w-full">
      <div ref={wrap} className="relative" style={{ height: h }}>
        <svg width={width} height={h} role="img" aria-label="Heat map of forecast power by day and time of day" tabIndex={0}
          className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          onKeyDown={(e) => {
            const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
            if (e.key === "Escape") return setActive(null);
            if (!d) return;
            e.preventDefault();
            setActive((a) => ({ r: clamp((a?.r ?? 0) + d[0], 0, grid.days.length - 1), c: clamp((a?.c ?? 0) + d[1], 0, cols - 1) }));
          }}
          onPointerMove={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            const c = Math.floor((e.clientX - b.left - LW) / (cw + gap)), r = Math.floor((e.clientY - b.top - TOP) / (ch + 3));
            setActive(c >= 0 && c < cols && r >= 0 && r < grid.days.length ? { r, c } : null);
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
          {Array.from({ length: cols }, (_, c) => c).filter((c) => (grid.first + c) % (narrow ? 16 : 8) === 0).map((c) => (
            <text key={c} x={LW + c * (cw + gap)} y={11} className="tabular fill-[var(--text-muted)] text-[10px]">{minuteLabel(grid.first + c)}</text>
          ))}
          {grid.days.map((d, r) => (
            <g key={d}>
              <text x={0} y={TOP + r * (ch + 3) + ch / 2} dominantBaseline="middle" className="fill-[var(--text-secondary)] text-[11px]">
                {narrow ? dateLabel(d).split(" ")[0] : dateLabel(d)}
              </text>
              {grid.cells[r].slice(grid.first, grid.last + 1).map((v, c) => {
                const l = level(v);
                return (
                  <rect key={c} x={LW + c * (cw + gap)} y={TOP + r * (ch + 3)} width={cw} height={ch} rx={Math.min(2, cw / 3)}
                    fill={l < 0 ? "transparent" : `var(--seq-${l})`} stroke={l < 0 ? "var(--grid)" : "none"} strokeDasharray={l < 0 ? "2 2" : undefined} />
                );
              })}
            </g>
          ))}
          {active && (
            <rect x={LW + active.c * (cw + gap) - 1} y={TOP + active.r * (ch + 3) - 1} width={cw + 2} height={ch + 2} rx={2} fill="none" stroke="var(--text-primary)" strokeWidth={1.5} pointerEvents="none" />
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute z-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-elevated"
            style={{ left: clamp(LW + active.c * (cw + gap) - 60, 0, width - 150), top: TOP + (active.r + 1) * (ch + 3) + 2 }}>
            <p className="tabular font-semibold text-ink">{cur == null ? "outside the forecast" : `${fmt(cur / div, 2)} ${unit}`}</p>
            <p className="text-muted">{dateLabel(grid.days[active.r])} · {minuteLabel(grid.first + active.c)}–{minuteLabel(grid.first + active.c + 1)}</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5">
          0
          <span className="flex gap-[2px]" aria-hidden>{Array.from({ length: STEPS + 1 }, (_, i) => <span key={i} className="h-2.5 w-3.5 rounded-[2px]" style={{ background: `var(--seq-${i})` }} />)}</span>
          {fmt(capacity / div, 1)} {unit}
        </span>
      </div>
    </div>
  );
}
