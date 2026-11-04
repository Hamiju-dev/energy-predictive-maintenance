import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Our own command palette (EasyUI command-menu was not reused: it copied an install command to the
   clipboard and opened GitHub). Opens with Ctrl/Cmd+K; arrows, Enter and Escape work. */
export interface Command { id: string; label: string; group: string; hint?: string; icon?: ReactNode; run: () => void; keywords?: string }

export function CommandPalette({ commands, open, setOpen }: { commands: Command[]; open: boolean; setOpen: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);
  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => words.every((w) => `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(w)));
  }, [q, commands]);
  const run = (c?: Command) => { if (!c) return; setOpen(false); c.run(); };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div role="dialog" aria-modal="true" aria-label="Command palette" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring.snappy}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Type a command or search…" aria-label="Search commands"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  else if (e.key === "Enter") { e.preventDefault(); run(list[active]); }
                  else if (e.key === "Escape") setOpen(false);
                }}
                className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted" />
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
            </div>
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
              {list.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matching command</li>}
              {list.map((c, i) => (
                <li key={c.id}>
                  {(i === 0 || list[i - 1].group !== c.group) && <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{c.group}</p>}
                  <button type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(c)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]", i === active ? "bg-surface-hover text-ink" : "text-ink-2")}>
                    <span className="text-muted [&>svg]:size-4">{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="text-[11.5px] text-muted">{c.hint}</span>}
                    {i === active && <CornerDownLeft className="size-3.5 text-muted" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
