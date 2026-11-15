import { useKeys } from "@/game/useKeys";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  step: string;
  prompt: string;
  options: Option<T>[];
  onChoose: (value: T | null) => void;
  onBack?: () => void;
  disabled?: boolean;
}

/** One multiple-choice question before the symptom questions (age, sex). Number keys pick, S skips. */
export function ProfileStep<T extends string>({ step, prompt, options, onChoose, onBack, disabled }: Props<T>) {
  const keys: Record<string, () => void> = { s: () => onChoose(null) };
  options.forEach((o, i) => (keys[String(i + 1)] = () => onChoose(o.value)));
  if (onBack) keys.u = onBack;
  useKeys(keys, !disabled);

  return (
    <Card>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{step}</p>
      <h2 className="mt-1 text-xl font-semibold" aria-live="polite">
        {prompt}
      </h2>
      <div className="mt-5 grid gap-2">
        {options.map((o, i) => (
          <Button key={o.value} align="between" onClick={() => onChoose(o.value)} disabled={disabled} shortcut={String(i + 1)}>
            {o.label}
          </Button>
        ))}
        <Button variant="ghost" align="between" onClick={() => onChoose(null)} disabled={disabled} shortcut="S">
          Prefer not to say
        </Button>
      </div>
      {onBack && (
        <Button variant="ghost" className="mt-4 -ml-2" onClick={onBack} disabled={disabled} shortcut="U">
          ← Back
        </Button>
      )}
    </Card>
  );
}
