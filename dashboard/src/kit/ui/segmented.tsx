import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "../lib/utils";

/* From the EasyUI earnings file: pill segmented control with a gliding thumb (radio group). */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: "sm" | "md"; className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-flex shrink-0 rounded-full bg-surface-raised p-0.5 ring-1 ring-line", className)}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        if (e.key === "ArrowRight") onChange(options[(i + 1) % options.length].value);
        else if (e.key === "ArrowLeft") onChange(options[(i - 1 + options.length) % options.length].value);
        else return;
        e.preventDefault();
      }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}
            className={cn("focus-ring relative z-10 shrink-0 rounded-full font-medium whitespace-nowrap transition-colors duration-150", size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12px]", on ? "text-ink" : "text-muted hover:text-ink-2")}>
            {on && <motion.span layoutId={id} className="absolute inset-0 -z-10 rounded-full bg-surface shadow-sm ring-1 ring-line" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
