import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI directional-tooltip: springs in from the side it points to.
   Fixed: spacing per side (the original margin overrode it), Escape closes, touch opens on tap. */
type Side = "top" | "bottom" | "left" | "right";
const pos: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};
const from: Record<Side, { x: number; y: number }> = { top: { x: 0, y: 6 }, bottom: { x: 0, y: -6 }, left: { x: 6, y: 0 }, right: { x: -6, y: 0 } };

export function Tip({ content, side = "top", children, className, wide }: { content: ReactNode; side?: Side; children: ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 150); };
  const hide = () => { window.clearTimeout(timer.current); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <span className={cn("relative inline-flex", className)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onTouchStart={() => setOpen((o) => !o)} aria-describedby={open ? id : undefined}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.95, ...from[side] }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={spring.snappy}
            className={cn(
              "pointer-events-none absolute z-50 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs leading-relaxed text-ink-2 shadow-elevated",
              wide ? "w-64 whitespace-normal" : "whitespace-nowrap",
              pos[side],
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
