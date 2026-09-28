"use client";
import { useState, useTransition } from "react";
import { deleteAssetAction, setCoverAction, type ActionState } from "@/app/actions/projects";
import { Button, buttonClass } from "@/components/ui/primitives";

export function AssetActions({
  projectId,
  assetId,
  canSetCover,
  canDelete,
  downloadUrl,
}: {
  projectId: string;
  assetId: string;
  canSetCover: boolean;
  canDelete: boolean;
  downloadUrl: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canSetCover && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => setState(await setCoverAction(projectId, assetId)))}>
            Usar como capa
          </Button>
        )}
        <a href={downloadUrl} download className={buttonClass("secondary", "sm")}>
          Baixar original
        </a>
        {canDelete &&
          (confirmDelete ? (
            <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => setState(await deleteAssetAction(projectId, assetId)))}>
              Confirmar remoção
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Remover
            </Button>
          ))}
      </div>
      {state?.message && <p className="text-[12px] text-ok">{state.message}</p>}
      {state?.error && <p className="text-[12px] text-bad">{state.error}</p>}
    </div>
  );
}
