import { motion } from "framer-motion";
import { signed } from "../kit/lib/format";
import { cn } from "../kit/lib/utils";
import { COMPONENTS, TURBINES, screening } from "../data";

/* Turbine × component grid of static offsets vs the sister turbines (°C, 2012).
   Diverging: hotter in the critical red, cooler in the accent blue, strength by size of the offset.
   Each cell is a button that opens that turbine and component in the health chart. */
const LIMIT = Math.max(3, ...screening.map((r) => Math.abs(r.offset_c)));

export function ScreeningMap({ turbine, component, onPick }: {
  turbine: string; component: string; onPick: (turbine: string, component: string) => void;
}) {
  const value = (t: string, c: string) => screening.find((r) => r.turbine === t && r.component === c)?.offset_c ?? null;
  return (
    <div className="w-full">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `minmax(5.5rem, auto) repeat(${TURBINES.length}, minmax(0, 1fr))` }}>
        <span />
        {TURBINES.map((t) => (
          <span key={t} className="pb-1 text-center text-[11px] font-medium text-muted">{t}</span>
        ))}
        {COMPONENTS.map((c) => (
          <Row key={c} c={c} turbine={turbine} component={component} value={value} onPick={onPick} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
        <span>Click a cell to open it in the health chart</span>
        <span className="flex items-center gap-1.5">
          cooler
          <span className="flex gap-[2px]" aria-hidden>
            {[-1, -0.5, 0, 0.5, 1].map((s) => (
              <span key={s} className="h-2.5 w-3.5 rounded-[2px] border border-line" style={{ background: tint(s * LIMIT) }} />
            ))}
          </span>
          hotter
        </span>
      </div>
    </div>
  );
}

function Row({ c, turbine, component, value, onPick }: {
  c: string; turbine: string; component: string; value: (t: string, c: string) => number | null; onPick: (t: string, c: string) => void;
}) {
  return (
    <>
      <span className="flex items-center text-[12px] text-ink-2 capitalize">{c}</span>
      {TURBINES.map((t) => {
        const v = value(t, c);
        const on = t === turbine && c === component;
        return (
          <motion.button key={t} type="button" whileTap={{ scale: 0.96 }} aria-pressed={on}
            aria-label={`${t} ${c}: ${v == null ? "no data" : `${signed(v)} °C`} versus sister turbines`}
            onClick={() => onPick(t, c)}
            className={cn("focus-ring relative h-10 rounded-lg border text-[12px] tabular transition-colors",
              on ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-hover",
              v != null && Math.abs(v) >= 2 ? "font-semibold text-ink" : "text-ink-2")}
            style={{ background: v == null ? "transparent" : tint(v) }}>
            {v == null ? "–" : signed(v)}
          </motion.button>
        );
      })}
    </>
  );
}

function tint(v: number) {
  const share = Math.round(Math.min(1, Math.abs(v) / LIMIT) * 55);
  const hue = v >= 0 ? "var(--critical)" : "var(--accent)";
  return `color-mix(in srgb, ${hue} ${share}%, var(--surface))`;
}
