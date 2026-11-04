import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI press-button: presses down on tap, springs back. */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line hover:border-line-hover hover:bg-surface-hover",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-hover border border-transparent",
  danger: "bg-critical text-white border border-transparent hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
  icon: "size-9 rounded-lg justify-center",
};

export type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, disabled, className, children, ...props },
  ref,
) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
      transition={spring.snappy}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex shrink-0 select-none items-center font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </motion.button>
  );
});
