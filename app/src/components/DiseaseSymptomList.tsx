import { statusLabel, type DiseaseSymptomRow } from "@/engine/diseaseSymptoms";

function group(rows: DiseaseSymptomRow[]) {
  const yes = rows.filter((r) => r.status === "yes");
  const no = rows.filter((r) => r.status === "no");
  const rest = rows.filter((r) => r.status === "unknown" || r.status === "not_asked");
  return { yes, no, rest };
}

interface Props {
  diseaseLabel: string;
  rows: DiseaseSymptomRow[];
}

export function DiseaseSymptomList({ diseaseLabel, rows }: Props) {
  if (rows.length === 0) return null;
  const { yes, no, rest } = group(rows);

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">Symptoms for {diseaseLabel}</h3>
      <p className="mt-1 text-xs text-muted leading-relaxed">
        From training data: how often each symptom appears with this condition, compared with your answers.
      </p>

      {yes.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">You reported</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {yes.map((r) => (
              <li key={r.index} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span>{r.label}</span>
                <span className="text-xs text-muted tabular-nums">
                  {statusLabel(r.status)} · typical {Math.round(r.pGivenDisease * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {no.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
            You said no ({no.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {no.map((r) => (
              <li key={r.index}>
                {r.label}{" "}
                <span className="text-xs tabular-nums">(typical {Math.round(r.pGivenDisease * 100)}%)</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
            Common for this condition, not confirmed yet ({rest.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {rest.map((r) => (
              <li key={r.index}>
                {r.label}{" "}
                <span className="text-xs tabular-nums">
                  (typical {Math.round(r.pGivenDisease * 100)}% · {statusLabel(r.status)})
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}