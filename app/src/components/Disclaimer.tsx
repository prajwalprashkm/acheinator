export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      Acheinator is a hackathon project, not medical advice. It can be wrong. If you&apos;re worried about your health,
      see a doctor. In an emergency, call your local emergency number.
    </p>
  );
}
