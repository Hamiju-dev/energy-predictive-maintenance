/** Number and unit formatting. Energy and power switch to MW/MWh for plants of 2 MWp and more. */

export type Scale = { power: "kW" | "MW"; energy: "kWh" | "MWh"; div: number };

export const scaleFor = (dcKwp: number): Scale =>
  dcKwp >= 2000 ? { power: "MW", energy: "MWh", div: 1000 } : { power: "kW", energy: "kWh", div: 1 };

const nf = (digits: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const cache = new Map<number, Intl.NumberFormat>();
export const fmt = (v: number | null | undefined, digits = 1) => {
  if (v == null || !Number.isFinite(v)) return "–";
  if (!cache.has(digits)) cache.set(digits, nf(digits));
  return cache.get(digits)!.format(v);
};

/** Pick a sensible number of decimals for a value shown in a tile. */
export const autoDigits = (v: number) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);

export const pct = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? "–" : `${fmt(v, digits)} %`);

export const signed = (v: number, digits = 1) => {
  const r = Number(v.toFixed(digits));          // so that -0.3 shown with 0 digits reads "±0", not "−0"
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${fmt(Math.abs(r), digits)}`;
};
