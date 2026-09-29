"use client";
import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { deleteAssetAction, setCoverAction, type ActionState } from "@/app/actions/projects";
import { Button, buttonClass } from "@/components/ui/primitives";

/** Ações do detalhe de um arquivo: capa do projeto, baixar o original e remover (só o que foi enviado). */
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
  const mobile = "h-10 sm:h-8";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canSetCover && (
          <Button size="sm" variant="primary" className={mobile} disabled={pending} onClick={() => start(async () => setState(await setCoverAction(projectId, assetId)))}>
            Usar como capa
          </Button>
        )}
        <a href={downloadUrl} download className={`${buttonClass("secondary", "sm")} ${mobile}`}>
          <Download size={14} aria-hidden />
          Baixar original
        </a>
        {canDelete &&
          (confirmDelete ? (
            <>
              <Button size="sm" variant="danger" className={mobile} disabled={pending} onClick={() => start(async () => setState(await deleteAssetAction(projectId, assetId)))}>
                Confirmar remoção
              </Button>
              <Button size="sm" variant="ghost" className={mobile} disabled={pending} onClick={() => setConfirmDelete(false)}>
                Manter
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className={mobile} onClick={() => setConfirmDelete(true)}>
              Remover
            </Button>
          ))}
      </div>
      {state?.message && (
        <p role="status" className="text-[13px] text-ok">
          {state.message}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-[13px] text-bad">
          {state.error}
        </p>
      )}
    </div>
  );
}
