import { useKeys } from "@/game/useKeys";
import { Disclaimer } from "./Disclaimer";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

export function IntroScreen({ onStart }: { onStart: () => void }) {
  useKeys({ enter: onStart });
  return (
    <Card>
      <h2 className="text-xl font-semibold">Think about how you&apos;re feeling.</h2>
      <p className="mt-2 text-muted">
        Acheinator asks yes/no questions about your symptoms, one at a time, and guesses what might be causing them. It
        knows 778 conditions and usually needs around 20 questions.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Answer &ldquo;Don&apos;t know&rdquo; if you&apos;re unsure; it won&apos;t count against anything.</li>
        <li>You can undo or change any earlier answer.</li>
        <li>Everything runs in your browser. Nothing you answer is sent anywhere.</li>
      </ul>
      <Button variant="primary" className="mt-6 w-full sm:w-auto" onClick={onStart} shortcut="Enter">
        Start
      </Button>
    </Card>
  );
}
