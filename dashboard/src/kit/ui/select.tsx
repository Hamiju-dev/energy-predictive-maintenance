import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI spring-select. Fixed: the list takes focus when it opens, arrow keys skip
   disabled options, Home/End/Tab work, and the active option is announced (aria-activedescendant). */
export interface Option<T extends string> { value: T; label: string; description?: string; disabled?: boolean }

export function Select<T extends string>({ value, onChange, options, label, className }: {
  value: T; onChange: (v: T) => void; options: Option<T>[]; label?: string; className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    list.current?.focus();
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const k = (from + dir * i + options.length) % options.length;
      if (!options[k].disabled) return k;
    }
    return from;
  };
  const choose = (i: number) => {
    if (options[i]?.disabled) return;
    onChange(options[i].value);
    setOpen(false);
    trigger.current?.focus();
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => move(a, 1)),
      ArrowUp: () => setActive((a) => move(a, -1)),
      Home: () => setActive(move(-1, 1)),
      End: () => setActive(move(options.length, -1)),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: () => { setOpen(false); trigger.current?.focus(); },
      Tab: () => setOpen(false),
    };
    if (keys[e.key]) { if (e.key !== "Tab") e.preventDefault(); keys[e.key](); }
  };

  return (
    <div ref={root} className={cn("relative w-full", className)}>
      {label && <label htmlFor={`${id}-t`} className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</label>}
      <button
        ref={trigger}
        id={`${id}-t`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
        className={cn("focus-ring flex h-9 w-full items-center justify-between rounded-lg border bg-surface-raised px-3 text-left text-[13px] text-ink transition-colors", open ? "border-line-hover" : "border-line hover:border-line-hover")}
      >
        <span className="truncate">{current?.label ?? "Select"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy} className="text-muted"><ChevronDown className="size-3.5" /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={list}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${id}-o${active}`}
            onKeyDown={onListKey}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute right-0 left-0 z-40 mt-1.5 max-h-64 overflow-auto rounded-xl border border-line bg-surface py-1 shadow-elevated outline-none"
          >
            {options.map((o, i) => (
              <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={o.value === value} aria-disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setActive(i)} onClick={() => choose(i)}
                className={cn("mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px]", o.value === value ? "text-ink" : "text-ink-2", i === active && "bg-surface-hover", o.disabled && "cursor-not-allowed opacity-40")}>
                <span className="flex flex-col">
                  <span className="leading-tight">{o.label}</span>
                  {o.description && <span className="mt-0.5 text-[11px] text-muted">{o.description}</span>}
                </span>
                {o.value === value && <Check className="size-3.5 shrink-0" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
