import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-card border-2 border-outline bg-surface p-5 sm:p-6 ${className}`} {...rest} />;
}
