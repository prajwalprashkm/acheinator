/** A gold bar in an outlined track, like the logo's lettering. value is 0..1. */
export function Meter({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full border-[1.5px] border-outline bg-surface-2 ${className}`} aria-hidden>
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} />
    </div>
  );
}
