import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Children, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/utils";

/* Adapted from EasyUI stepper, in our tokens. */
const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
const fill = { duration: 0.35, ease: [0.32, 0.72, 0, 1] } as const;

export function Stepper({ steps, current, onStepChange }: { steps: { title: string; description?: string }[]; current: number; onStepChange?: (i: number) => void }) {
  const uid = useId();
  const ready = useRef(false);
  useEffect(() => { ready.current = true; }, []);
  const last = steps.length - 1;
  return (
    <ol aria-label="Progress" className="flex w-full items-center">
      {steps.map((s, i) => {
        const state = i < current ? "complete" : i === current ? "current" : "upcoming";
        const indicator = (
          <span className={cn("relative grid size-7 shrink-0 place-items-center rounded-full border text-xs font-medium tabular transition-colors duration-300",
            state === "complete" && "border-accent bg-accent text-white",
            state === "current" && "border-accent text-accent",
            state === "upcoming" && "border-line text-muted")}>
            {state === "current" && <motion.span layoutId={`${uid}-ring`} transition={spring} className="absolute -inset-[5px] rounded-full border border-[var(--accent-ring)]" />}
            {state === "complete" ? (
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={ready.current ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.08 }} />
              </svg>
            ) : i + 1}
          </span>
        );
        const label = (
          <span className={cn("min-w-0 flex-col text-left", state === "current" ? "flex" : "hidden sm:flex")}>
            <span className={cn("truncate text-[12.5px]", state === "upcoming" ? "text-muted" : "font-medium text-ink")}>{s.title}{state === "complete" && <span className="sr-only"> (completed)</span>}</span>
          </span>
        );
        return (
          <li key={i} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center", i < last && "flex-1")}>
            {onStepChange && state === "complete" ? (
              <button type="button" onClick={() => onStepChange(i)} className="focus-ring flex items-center gap-2 rounded-lg">{indicator}{label}</button>
            ) : <div className="flex items-center gap-2">{indicator}{label}</div>}
            {i < last && (
              <span aria-hidden className="relative mx-2 h-px flex-1 overflow-hidden bg-[var(--grid)]">
                <motion.span initial={false} animate={{ scaleX: i < current ? 1 : 0 }} transition={fill} className="absolute inset-0 origin-left bg-accent" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const slide: Variants = { enter: (d: number) => ({ x: d * 24, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -24, opacity: 0 }) };

export function StepPanels({ current, children }: { current: number; children: ReactNode }) {
  const panels = Children.toArray(children);
  const prev = useRef(current);
  const dir = current >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = current; }, [current]);
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div key={current} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}>
        {panels[current]}
      </motion.div>
    </AnimatePresence>
  );
}
