import { Card } from "./ui/Card";
import { Meter } from "./ui/Meter";

export function LoadingScreen({ progress, error }: { progress: number; error: string | null }) {
  if (error) {
    return (
      <Card role="alert">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <p className="mt-2 text-sm text-muted">Try reloading the page.</p>
      </Card>
    );
  }
  const pct = Math.min(100, Math.round(Math.min(1, Math.max(0, progress)) * 100));
  return (
    <Card>
      <h2 className="text-lg font-semibold">Loading the model…</h2>
      <p className="mt-1 text-sm text-muted">
        It runs entirely in your browser, so nothing you answer leaves your device. This takes a moment the first time.
      </p>
      <div className="mt-4" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <Meter value={progress} />
      </div>
      <p className="mt-2 text-xs text-muted tabular-nums">{pct}%</p>
    </Card>
  );
}
