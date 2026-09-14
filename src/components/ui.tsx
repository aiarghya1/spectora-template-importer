import type { ButtonHTMLAttributes, ReactNode } from "react";

const VARIANTS = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-400",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 disabled:opacity-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50",
  ghost: "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent",
} as const;
const SIZES = { sm: "h-7 px-2 text-xs", md: "h-9 px-3 text-sm" } as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const linkButtonClass =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50";

const TONES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
} as const;

export function Banner({ tone = "info", title, children }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Badge({ children, className = "bg-zinc-100 text-zinc-700 ring-zinc-200" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function commentTypeStyle(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("def")) return "bg-red-50 text-red-800 ring-red-200";
  if (t.startsWith("lim")) return "bg-amber-50 text-amber-900 ring-amber-200";
  if (t.startsWith("inf")) return "bg-sky-50 text-sky-900 ring-sky-200";
  return "bg-zinc-100 text-zinc-700 ring-zinc-200";
}

/** Fixed timezone so server and client render identical text (no hydration mismatch). */
export function formatDateTime(iso: string): string {
  return `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso))} UTC`;
}

export const formatNumber = (n: number) => n.toLocaleString("en-US");
