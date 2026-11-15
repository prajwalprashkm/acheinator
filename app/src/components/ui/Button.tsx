import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border-outline hover:bg-accent-strong font-semibold",
  secondary: "bg-surface text-ink border-outline hover:bg-surface-2",
  ghost: "bg-transparent text-muted border-transparent hover:text-ink hover:bg-surface-2",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** keyboard shortcut shown on the button, e.g. "Y" */
  shortcut?: string;
  /** "between": label on the left, shortcut on the right (for list-style options) */
  align?: "center" | "between";
}

export function Button({ variant = "secondary", shortcut, align = "center", className = "", children, ...rest }: Props) {
  const justify = align === "between" ? "justify-between text-left" : "justify-center";
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center gap-2 rounded-control border-2 px-4 py-2 text-[0.95rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${justify} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
      {shortcut && (
        <kbd aria-hidden className="hidden rounded border border-current px-1 font-sans text-xs opacity-60 sm:inline">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
