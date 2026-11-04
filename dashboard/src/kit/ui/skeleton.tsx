import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";

/* Adapted from EasyUI skeleton: the light sweep stops when reduced motion is on. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className={cn("relative overflow-hidden rounded-md bg-surface-raised", className)} {...props}>
      {!reduce && (
        <motion.span
          className="absolute inset-0 bg-[linear-gradient(90deg,transparent,var(--sk),transparent)] [--sk:rgb(255_255_255/0.7)] dark:[--sk:rgb(255_255_255/0.05)]"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.2 }}
        />
      )}
    </div>
  );
}

export function SkeletonReveal({ loading, skeleton, children, className }: { loading: boolean; skeleton: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div key="s" role="status" aria-busy="true" aria-label="Loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {skeleton}
          </motion.div>
        ) : (
          <motion.div key="c" initial={{ opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
