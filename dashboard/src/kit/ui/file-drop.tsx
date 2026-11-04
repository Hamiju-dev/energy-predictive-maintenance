import { motion } from "framer-motion";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "../lib/utils";
import { spring } from "../lib/motion";

/* Adapted from EasyUI animated-file-upload: a drop zone that reacts to drag-over.
   Unlike the original it does not simulate uploads; it hands the file to onFile, and it checks
   the file type and size for dropped files too (the original only checked in the file dialog). */
export function FileDrop({ accept, maxBytes = 20 * 1024 * 1024, onFile, title, subtitle, compact, busy, className }: {
  accept: string[]; maxBytes?: number; onFile: (f: File) => void; title: string; subtitle?: string; compact?: boolean; busy?: boolean; className?: string;
}) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const take = (f?: File) => {
    if (!f) return;
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (!accept.includes(ext)) return setError(`Expected ${accept.join(", ")}; got ${ext}`);
    if (f.size > maxBytes) return setError(`File larger than ${Math.round(maxBytes / 1048576)} MB`);
    setError(null);
    onFile(f);
  };
  return (
    <div className={className}>
      <input ref={input} type="file" accept={accept.join(",")} className="hidden" aria-label={title} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      <motion.div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        animate={{ scale: over ? 1.01 : 1 }}
        transition={spring.snappy}
        className={cn("focus-ring flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
          over ? "border-accent bg-accent-soft" : "border-line-hover bg-surface-raised hover:border-accent",
          compact ? "gap-1 px-4 py-4" : "gap-2 px-6 py-8")}
      >
        <motion.span animate={{ y: over ? -3 : 0, scale: over ? 1.08 : 1 }} transition={spring.snappy} className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted">
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Upload className="size-4" />}
        </motion.span>
        <span className="text-[13px] font-medium text-ink">{title}</span>
        {subtitle && <span className="text-[12px] text-muted">{subtitle}</span>}
      </motion.div>
      {error && <p role="alert" className="mt-1.5 text-[12px] text-critical">{error}</p>}
    </div>
  );
}
