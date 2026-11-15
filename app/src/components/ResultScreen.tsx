import type { DiseaseSymptomRow } from "@/engine/diseaseSymptoms";
import type { Guess, Meta } from "@/engine/types";
import { useKeys } from "@/game/useKeys";
import { DiseaseSymptomList } from "./DiseaseSymptomList";
import { Disclaimer } from "./Disclaimer";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/** MedlinePlus (US National Library of Medicine) search for a condition. */
function learnMoreUrl(label: string) {
  const query = label.replace(/\s*\([^)]*\)/g, "").trim() || label;
  return `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query=${encodeURIComponent(query)}`;
}

function LearnMore({ label }: { label: string }) {
  return (
    <a
      href={learnMoreUrl(label)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium underline underline-offset-2 hover:text-muted"
    >
      Learn more on MedlinePlus<span className="sr-only"> about {label} (opens in a new tab)</span>
    </a>
  );
}

interface Props {
  meta: Meta;
  guesses: Guess[];
  questionsAsked: number;
  stopReason: string | null;
  busy: boolean;
  diseaseSymptoms: (diseaseIndex: number) => DiseaseSymptomRow[];
  onKeepAsking: () => void;
  onPlayAgain: () => void;
}

export function ResultScreen({
  meta,
  guesses,
  questionsAsked,
  stopReason,
  busy,
  diseaseSymptoms,
  onKeepAsking,
  onPlayAgain,
}: Props) {
  useKeys({ k: onKeepAsking, enter: onPlayAgain }, !busy);
  const [top, ...others] = guesses;
  if (!top) return null;
  const info = meta.info[String(top.index)];
  const symptomRows = diseaseSymptoms(top.index);

  return (
    <Card aria-live="polite">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        After {questionsAsked} question{questionsAsked === 1 ? "" : "s"}
      </p>
      <h2 className="mt-2 text-sm text-muted">I think it might be</h2>
      <p className="mt-1 text-2xl font-semibold sm:text-3xl">{top.label}</p>
      <p className="mt-1 text-sm text-muted tabular-nums">
        {Math.round(top.p * 100)}% confidence
        {stopReason === null && " (you asked for a guess early)"}
      </p>

      {info?.description && <p className="mt-4 leading-relaxed">{info.description}</p>}
      {info && info.precautions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Precautions</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {info.precautions.map((p) => (
              <li key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <LearnMore label={top.label} />
      </div>

      <DiseaseSymptomList diseaseLabel={top.label} rows={symptomRows} />

      {others.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Other possibilities</h3>
          <ul className="mt-2 space-y-2">
            {others.map((g) => (
              <li key={g.index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span>
                  {g.label} <span className="text-sm text-muted tabular-nums">({Math.round(g.p * 100)}%)</span>
                </span>
                <LearnMore label={g.label} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onKeepAsking} disabled={busy} shortcut="K">
          Keep asking to refine
        </Button>
        <Button variant="primary" onClick={onPlayAgain} disabled={busy} shortcut="Enter">
          Play again
        </Button>
      </div>
    </Card>
  );
}
