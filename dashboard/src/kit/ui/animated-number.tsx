import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { EASE_OUT } from "../lib/motion";

/* From the EasyUI earnings file: a number that counts to its new value. */
export function AnimatedNumber({ value, format, duration = 0.9 }: { value: number; format: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const fmtRef = useRef(format);
  fmtRef.current = format;
  const text = useTransform(mv, (v) => fmtRef.current(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: reduce ? 0 : duration, ease: EASE_OUT });
    return () => c.stop();
  }, [value, duration, mv, reduce]);
  return <motion.span className="tabular">{text}</motion.span>;
}
