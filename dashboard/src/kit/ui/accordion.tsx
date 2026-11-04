import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI smooth-accordion, in our tokens, with aria-controls and regions. */
export function Accordion({ items, className }: { items: { id: string; title: string; subtitle?: string; content: ReactNode }[]; className?: string }) {
  const [open, setOpen] = useState<string[]>([]);
  const uid = useId();
  return (
    <div className={cn("divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-line", className)}>
      {items.map((it) => {
        const on = open.includes(it.id);
        return (
          <div key={it.id}>
            <button type="button" aria-expanded={on} aria-controls={`${uid}-${it.id}`} onClick={() => setOpen((o) => (on ? o.filter((x) => x !== it.id) : [...o, it.id]))}
              className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover">
              <span>
                <span className="block text-[13px] font-medium text-ink">{it.title}</span>
                {it.subtitle && <span className="mt-0.5 block text-[12px] text-muted">{it.subtitle}</span>}
              </span>
              <motion.span animate={{ rotate: on ? 180 : 0 }} transition={spring.snappy} className="shrink-0 text-muted"><ChevronDown className="size-4" /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div id={`${uid}-${it.id}`} role="region" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.gentle} className="overflow-hidden">
                  <div className="px-4 pt-0.5 pb-4 text-[13px] leading-relaxed text-ink-2">{it.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
