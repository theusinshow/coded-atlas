"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { compareCapturesAction, type JobActionState } from "@/app/actions/projects";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

export interface DiffCandidate {
  id: string;
  label: string;
  /** dispositivo + papel (tela/página inteira/…): só pares do mesmo grupo fazem sentido. */
  group: string;
}

/**
 * Comparar capturas: escolher "antes" e "depois". O padrão é a penúltima × a última
 * captura do mesmo grupo (vigiar um site já entregue: recapture e compare).
 */
export function VisualDiffForm({ candidates }: { candidates: DiffCandidate[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<JobActionState, FormData>(compareCapturesAction, null);
  const groups = new Map<string, DiffCandidate[]>();
  for (const c of candidates) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const firstPair = [...groups.values()].find((g) => g.length >= 2);
  const [after, setAfter] = useState(firstPair?.[0].id ?? "");
  const [before, setBefore] = useState(firstPair?.[1].id ?? "");
  const afterGroup = candidates.find((c) => c.id === after)?.group;

  if (!firstPair) {
    return <p className="text-[13px] text-cbm-gray-400">Faça mais uma captura do mesmo dispositivo para comparar.</p>;
  }

  const options = (list: DiffCandidate[]) =>
    [...groups.entries()].map(([group, items]) => (
      <optgroup key={group} label={group}>
        {items.filter((i) => list.includes(i)).map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </optgroup>
    ));

  return (
    <form action={action} className="space-y-3" data-diff-form>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <label htmlFor="diff-before" className={LABEL_CLASS}>
            Antes
          </label>
          <select id="diff-before" name="beforeAssetId" value={before} onChange={(e) => setBefore(e.target.value)} className={INPUT_CLASS}>
            {options(candidates.filter((c) => !afterGroup || c.group === afterGroup))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="diff-after" className={LABEL_CLASS}>
            Depois
          </label>
          <select
            id="diff-after"
            name="afterAssetId"
            value={after}
            onChange={(e) => {
              const next = e.target.value;
              setAfter(next);
              const group = candidates.find((c) => c.id === next)?.group;
              if (candidates.find((c) => c.id === before)?.group !== group) setBefore(candidates.find((c) => c.group === group && c.id !== next)?.id ?? "");
            }}
            className={INPUT_CLASS}
          >
            {options(candidates)}
          </select>
        </div>
        <Button type="submit" disabled={pending || !before || !after || before === after} className="h-[42px]">
          {pending ? "Enfileirando…" : "Comparar"}
        </Button>
      </div>
      <FormError message={state?.error} />
      {state?.jobId && <JobFollower key={state.jobId} jobId={state.jobId} onDone={() => router.refresh()} />}
    </form>
  );
}
