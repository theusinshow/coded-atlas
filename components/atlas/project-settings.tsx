"use client";
import { useActionState, useState, useTransition } from "react";
import {
  changeSlugAction,
  deleteProjectAction,
  setProjectStatusAction,
  updateProjectAction,
  type ActionState,
} from "@/app/actions/projects";
import { Button, Field, FormError, INPUT_CLASS, SectionTitle } from "@/components/ui/primitives";

interface ProjectView {
  id: string;
  slug: string;
  name: string;
  category: string;
  client: string | null;
  description: string | null;
  status: "active" | "archived";
  origin: "atlas" | "legacy";
}

/**
 * Excluir fica neutro até a confirmação bater; então acende em vermelho (150 ms) —
 * o botão só chama atenção quando a ação é de fato possível.
 */
const DELETE_IDLE = "border border-line text-cbm-gray-400";
const DELETE_ARMED = "border border-bad text-bad hover:bg-bad/10";

export function ProjectSettingsForms({ project, categories }: { project: ProjectView; categories: string[] }) {
  const [editState, editAction, saving] = useActionState<ActionState, FormData>(updateProjectAction.bind(null, project.id), null);
  const [deleteState, deleteAction, deleting] = useActionState<ActionState, FormData>(deleteProjectAction.bind(null, project.id), null);
  const [slugState, slugAction, renaming] = useActionState<ActionState, FormData>(changeSlugAction.bind(null, project.id), null);
  const [statusState, setStatusState] = useState<ActionState>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const armed = confirmation === project.slug;

  function toggleStatus() {
    startTransition(async () => {
      setStatusState(await setProjectStatusAction(project.id, project.status === "active" ? "archived" : "active"));
    });
  }

  return (
    <div className="max-w-2xl space-y-12">
      <section aria-labelledby="detalhes">
        <SectionTitle id="detalhes">Detalhes</SectionTitle>
        <form action={editAction} className="space-y-5">
          <Field label="Nome" htmlFor="ps-name">
            <input id="ps-name" name="name" required maxLength={200} defaultValue={project.name} className={INPUT_CLASS} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Categoria" htmlFor="ps-category">
              <input id="ps-category" name="category" required list="ps-categories" maxLength={80} defaultValue={project.category} autoComplete="off" className={INPUT_CLASS} />
              <datalist id="ps-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Cliente" htmlFor="ps-client">
              <input id="ps-client" name="client" maxLength={200} defaultValue={project.client ?? ""} className={INPUT_CLASS} />
            </Field>
          </div>
          <Field label="Descrição" htmlFor="ps-description">
            <textarea id="ps-description" name="description" rows={4} maxLength={2000} defaultValue={project.description ?? ""} className={INPUT_CLASS} />
          </Field>
          <FormError message={editState?.error} />
          {editState?.message && (
            <p role="status" className="text-[12px] text-ok">
              {editState.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={saving} className="max-sm:w-full">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="endereco">
        <SectionTitle id="endereco">Endereço</SectionTitle>
        <form action={slugAction} className="space-y-3">
          <Field label="Identificador no link" htmlFor="ps-slug" hint="Usado no link do projeto. Links antigos param de funcionar; imagens e peças não mudam.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="ps-slug" name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Letras minúsculas, números e hífens" defaultValue={project.slug} className={`${INPUT_CLASS} font-mono`} />
              <Button type="submit" disabled={renaming} className="h-[42px] shrink-0">
                {renaming ? "Trocando…" : "Trocar"}
              </Button>
            </div>
          </Field>
          <FormError message={slugState?.error} />
        </form>
      </section>

      <section aria-labelledby="ciclo">
        <SectionTitle id="ciclo">{project.status === "active" ? "Arquivar" : "Arquivado"}</SectionTitle>
        <div className="flex flex-col gap-4 border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-cbm-gray-200 max-w-md">
            {project.status === "active"
              ? "Tira o projeto da biblioteca sem apagar nada. Dá para restaurar quando quiser."
              : "Projeto arquivado: fora da biblioteca, com todo o material guardado."}
          </p>
          <Button onClick={toggleStatus} disabled={pending} className="shrink-0">
            {project.status === "active" ? "Arquivar" : "Restaurar"}
          </Button>
        </div>
        <FormError message={statusState?.error} />
      </section>

      <section aria-labelledby="excluir">
        <SectionTitle id="excluir">Excluir definitivamente</SectionTitle>
        <form action={deleteAction} className="border border-line p-4 space-y-4">
          <p className="text-[13px] text-cbm-gray-200">
            Apaga o projeto com origens, capturas, imagens e peças. Não dá para desfazer.
            {project.origin === "legacy" && " Arquivos originais do site não são apagados."}
          </p>
          <Field label={`Digite "${project.slug}" para confirmar`} htmlFor="ps-confirm">
            <input
              id="ps-confirm"
              name="confirmation"
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT_CLASS} font-mono`}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <FormError message={deleteState?.error} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={deleting || !armed}
              className={`inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed max-sm:w-full ${armed ? DELETE_ARMED : DELETE_IDLE}`}
            >
              {deleting ? "Excluindo…" : "Excluir projeto"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
