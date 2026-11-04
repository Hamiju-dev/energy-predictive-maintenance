import type { Transition } from "framer-motion";

/* Motion tokens from the EasyUI site (G5), plus the two it uses but never shows
   (springMorph, springResponsive), defined here. */
export const spring = {
  smooth: { type: "spring", stiffness: 300, damping: 30 },
  snappy: { type: "spring", stiffness: 400, damping: 25 },
  bouncy: { type: "spring", stiffness: 500, damping: 15 },
  gentle: { type: "spring", stiffness: 180, damping: 24 },
  morph: { type: "spring", stiffness: 380, damping: 32, mass: 0.8 },
  responsive: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
} satisfies Record<string, Transition>;

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
