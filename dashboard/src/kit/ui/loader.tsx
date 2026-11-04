import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/utils";

/* Adapted from EasyUI loader (line variant): a bar sliding across a track; a gentle pulse when reduced motion is on. */
export function LineLoader({ className, label = "Loading" }: { className?: string; label?: string }) {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("relative h-1 w-full overflow-hidden rounded-full bg-surface-raised", className)}>
      <motion.div
        className="absolute inset-y-0 w-[35%] rounded-full bg-accent"
        animate={reduce ? { opacity: [0.4, 1, 0.4] } : { left: ["-35%", "100%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}
