import { useId, type ReactNode } from "react";
import { cn } from "../lib/utils";

/* Number input with label, unit and hint. Empty input gives null when `optional`. */
export function NumberField({ label, value, onChange, unit, step = "any", min, max, hint, optional, className }: {
  label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: number | "any"; min?: number; max?: number; hint?: ReactNode; optional?: boolean; className?: string;
}) {
  const id = useId();
  const invalid = value != null && ((min != null && value < min) || (max != null && value > max));
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink-2">
        <span>{label}</span>
        {optional && <span className="font-normal text-muted">optional</span>}
      </label>
      <div className={cn("focus-within:border-[var(--accent-ring)] flex h-9 items-center rounded-lg border bg-surface-raised transition-colors", invalid ? "border-critical" : "border-line hover:border-line-hover")}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value ?? ""}
          placeholder={optional ? "none" : undefined}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value === "" ? (optional ? null : 0) : Number(e.target.value))}
          className="tabular h-full w-full min-w-0 bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-muted"
        />
        {unit && <span className="pr-3 text-[12px] text-muted">{unit}</span>}
      </div>
      {hint && <p className={cn("mt-1 text-[11.5px]", invalid ? "text-critical" : "text-muted")}>{invalid ? `Between ${min} and ${max}` : hint}</p>}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, className }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line bg-surface-raised px-3 text-[13px] text-ink outline-none transition-colors hover:border-line-hover focus:border-[var(--accent-ring)]" />
      {hint && <p className="mt-1 text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}
