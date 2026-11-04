import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Tip } from "./tooltip";

/* Card with one header row: title and short meta on the left, controls on the right.
   Longer explanations go behind the info icon, not into the layout. Cards fill their grid row. */
export function Card({ title, meta, info, actions, children, className, bodyClassName, id }: {
  title?: ReactNode; meta?: ReactNode; info?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <header className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-2">
            {title && <h2 className="text-[14px] font-semibold tracking-tight whitespace-nowrap text-ink">{title}</h2>}
            {meta && <span className="truncate text-[12px] text-muted">{meta}</span>}
            {info && (
              <Tip content={info} side="bottom" wide>
                <span tabIndex={0} aria-label="More information" className="focus-ring grid size-4 place-items-center self-center rounded-full text-muted hover:text-ink"><Info className="size-3.5" /></span>
              </Tip>
            )}
          </div>
          {actions && <div className="flex min-w-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
