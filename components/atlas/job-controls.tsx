"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelJobAction, syncLegacyAction, type ActionState } from "@/app/actions/projects";
import { Button } from "@/components/ui/primitives";

/** Atualiza a tela do servidor periodicamente enquanto houver trabalho em andamento. */
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}

export function CancelJobButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending || Boolean(state?.message)} onClick={() => start(async () => setState(await cancelJobAction(jobId)))}>
        {state?.message ? "Cancelando…" : "Cancelar"}
      </Button>
      {state?.error && <span className="text-[11px] text-bad">{state.error}</span>}
    </span>
  );
}

export function SyncLegacyButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={() => start(async () => setState(await syncLegacyAction()))}>
        {pending ? "Verificando…" : "Sincronizar biblioteca v1"}
      </Button>
      {state?.message && <p className="text-[12px] text-cbm-gray-400">{state.message}</p>}
      {state?.error && <p className="text-[12px] text-bad">{state.error}</p>}
    </div>
  );
}
