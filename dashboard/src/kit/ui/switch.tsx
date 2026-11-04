import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI stretch-switch. Fixed: the thumb now really stretches while pressed
   (the original only recomputed the stretch when the thumb moved). Optional colour per series. */
export function Switch({ checked, onChange, label, description, color, disabled, className }: {
  checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; color?: string; disabled?: boolean; className?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3 select-none", disabled && "cursor-not-allowed opacity-40", className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13px] font-medium leading-tight text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onClick={() => onChange(!checked)}
        className={cn("focus-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-200", checked ? "border-transparent" : "border-line bg-surface-raised")}
        style={checked ? { background: color ?? "var(--text-primary)" } : undefined}
      >
        <motion.span
          className={cn("block size-3.5 rounded-full shadow-sm", checked ? "bg-white dark:bg-[var(--bg)]" : "bg-muted")}
          animate={{ x: checked ? 16 : 0, scaleX: pressed ? 1.2 : 1, scaleY: pressed ? 0.86 : 1 }}
          transition={spring.snappy}
        />
      </button>
    </label>
  );
}
