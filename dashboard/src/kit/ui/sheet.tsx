import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Side sheet in the spirit of EasyUI sheet: slides in with a spring, Escape and backdrop close it,
   focus moves in on open and back to the opener on close. */
export function Sheet({ open, onClose, title, description, children, footer, side = "left", className }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; side?: "left" | "right"; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input,select,button,[tabindex='0']")?.focus(), 60);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
      opener.current?.focus?.();
    };
  }, [open, onClose]);
  const x = side === "left" ? "-100%" : "100%";
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x }}
            animate={{ x: 0 }}
            exit={{ x }}
            transition={spring.morph}
            className={cn("absolute inset-y-0 flex w-full max-w-[440px] flex-col border-line bg-surface shadow-elevated", side === "left" ? "left-0 border-r" : "right-0 border-l", className)}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
                {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="focus-ring grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink">
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
