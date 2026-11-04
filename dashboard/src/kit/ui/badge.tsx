import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/* Adapted from EasyUI badge: text and numbers roll when they change; status dot with optional ping.
   Status tones always come with a word, never colour alone. */
export type BadgeTone = "neutral" | "accent" | "good" | "warning" | "critical";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  good: "bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-good-text border-transparent",
  warning: "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-warning-text border-transparent",
  critical: "bg-[color-mix(in_srgb,var(--critical)_12%,transparent)] text-critical border-transparent",
};
const dots: Record<BadgeTone, string> = {
  neutral: "bg-muted",
  accent: "bg-accent",
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
};

export function Badge({ tone = "neutral", dot, pulse, children, className, title }: {
  tone?: BadgeTone; dot?: boolean; pulse?: boolean; children: ReactNode; className?: string; title?: string;
}) {
  const reduce = useReducedMotion();
  const roll = typeof children === "string" || typeof children === "number";
  return (
    <span title={title} className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && (
        <span className="relative flex size-1.5 shrink-0">
          {pulse && !reduce && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", dots[tone])} />}
          <span className={cn("relative size-1.5 rounded-full", dots[tone])} />
        </span>
      )}
      {roll && !reduce ? (
        <span className="relative inline-flex overflow-hidden py-px">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={String(children)}
              initial={{ y: "70%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-70%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.6 }}
              className="tabular inline-block"
            >
              {children}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : (
        children
      )}
    </span>
  );
}
