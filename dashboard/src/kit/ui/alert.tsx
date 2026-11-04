import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

/* Adapted from EasyUI alert: collapses when dismissed; status tones use the reserved status colours. */
export type AlertTone = "info" | "good" | "warning" | "critical";
const tones: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "border-line bg-surface-raised", icon: "text-accent", Icon: Info },
  good: { box: "border-[color-mix(in_srgb,var(--good)_30%,transparent)] bg-[color-mix(in_srgb,var(--good)_7%,var(--surface))]", icon: "text-good-text", Icon: CircleCheck },
  warning: { box: "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface))]", icon: "text-warning-text", Icon: TriangleAlert },
  critical: { box: "border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_7%,var(--surface))]", icon: "text-critical", Icon: CircleAlert },
};

export function Alert({ tone = "info", title, children, dismissible, action, className }: {
  tone?: AlertTone; title: ReactNode; children?: ReactNode; dismissible?: boolean; action?: ReactNode; className?: string;
}) {
  const [visible, setVisible] = useState(true);
  const t = tones[tone];
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="overflow-hidden"
        >
          <div role={tone === "critical" || tone === "warning" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-[13px]", t.box, className)}>
            <t.Icon className={cn("mt-0.5 size-4 shrink-0", t.icon)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{title}</p>
              {children && <div className="mt-0.5 text-ink-2">{children}</div>}
            </div>
            {action && <div className="-my-1 shrink-0">{action}</div>}
            {dismissible && (
              <button type="button" aria-label="Dismiss" onClick={() => setVisible(false)} className="focus-ring -mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-ink">
                <X className="size-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
