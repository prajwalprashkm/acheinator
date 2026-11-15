export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      Obviously, Acheinator does not provide a real medical diagnosis. It can be wrong. If you're worried about your health, see a doctor.
    </p>
  );
}
