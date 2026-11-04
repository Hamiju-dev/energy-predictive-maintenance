import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Smooth monotone cubic path through points (never overshoots the data; from the EasyUI earnings file). */
export function monotonePath(p: [number, number][]): string {
  const n = p.length;
  if (n < 2) return n ? `M${p[0][0]} ${p[0][1]}` : "";
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = (p[i + 1][1] - p[i][1]) / (dx[i] || 1e-9);
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(p[i][0] + h).toFixed(1)} ${(p[i][1] + t[i] * h).toFixed(1)} ${(p[i + 1][0] - h).toFixed(1)} ${(p[i + 1][1] - t[i + 1] * h).toFixed(1)} ${p[i + 1][0].toFixed(1)} ${p[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** Path through a series with gaps: null values break the line into segments. */
export function gappedPath(xs: number[], ys: (number | null)[], smooth = false): string {
  let out = "";
  let seg: [number, number][] = [];
  const flush = () => {
    if (seg.length) out += smooth ? monotonePath(seg) : "M" + seg.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
    seg = [];
  };
  ys.forEach((y, i) => (y == null ? flush() : seg.push([xs[i], y])));
  flush();
  return out;
}

/** Closed band between a lower and an upper series (gaps split the band). */
export function bandPath(xs: number[], lo: (number | null)[], hi: (number | null)[]): string {
  let out = "";
  let i = 0;
  while (i < xs.length) {
    while (i < xs.length && (lo[i] == null || hi[i] == null)) i++;
    const start = i;
    while (i < xs.length && lo[i] != null && hi[i] != null) i++;
    if (i - start < 2) continue;
    const top = [], bot = [];
    for (let k = start; k < i; k++) top.push(`${xs[k].toFixed(1)} ${(hi[k] as number).toFixed(1)}`);
    for (let k = i - 1; k >= start; k--) bot.push(`${xs[k].toFixed(1)} ${(lo[k] as number).toFixed(1)}`);
    out += `M${top.join("L")}L${bot.join("L")}Z`;
  }
  return out;
}

/** "Nice" axis ticks from 0 to max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));
  return out;
}

/** Ticks spanning min..max (for values that can be negative). */
export function niceRange(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

export function useElementWidth<T extends HTMLElement>(initial = 600): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.clientWidth) || initial);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width];
}

/** Calls onDismiss on a pointer-down outside ref while enabled (touch: tap outside clears). */
export function useDismissOutside(ref: RefObject<HTMLElement | null>, enabled: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [ref, enabled, onDismiss]);
}

/** Index of the value in a sorted array closest to x. */
export function nearestIndex(arr: number[], x: number): number {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid; else hi = mid;
  }
  return Math.abs(arr[lo] - x) <= Math.abs(arr[hi] - x) ? lo : hi;
}
