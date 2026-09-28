"use client";
import { useActionState, useState, useTransition } from "react";
import {
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

export function ProjectSettingsForms({ project, categories }: { project: ProjectView; categories: string[] }) {
  const [editState, editAction, saving] = useActionState<ActionState, FormData>(updateProjectAction.bind(null, project.id), null);
  const [deleteState, deleteAction, deleting] = useActionState<ActionState, FormData>(deleteProjectAction.bind(null, project.id), null);
  const [statusState, setStatusState] = useState<ActionState>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

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
              <input id="ps-category" name="category" required list="ps-categories" maxLength={80} defaultValue={project.category} className={INPUT_CLASS} />
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
          <p className="text-[12px] text-zinc-500">
            Slug: <span className="font-mono text-zinc-300">{project.slug}</span> (fixo — é o endereço do projeto)
          </p>
          <FormError message={editState?.error} />
          {editState?.message && <p className="text-[12px] text-ok">{editState.message}</p>}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="ciclo">
        <SectionTitle id="ciclo">Ciclo de vida</SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-4 border border-line p-4">
          <p className="text-[13px] text-zinc-300 max-w-md">
            {project.status === "active"
              ? "Arquivar tira o projeto da biblioteca sem apagar nada. Dá para restaurar a qualquer momento."
              : "Projeto arquivado: fora da biblioteca, mas com todo o material preservado."}
          </p>
          <Button onClick={toggleStatus} disabled={pending}>
            {project.status === "active" ? "Arquivar" : "Restaurar"}
          </Button>
        </div>
        <FormError message={statusState?.error} />
      </section>

      <section aria-labelledby="excluir">
        <SectionTitle id="excluir">Excluir definitivamente</SectionTitle>
        <form action={deleteAction} className="border border-bad/40 p-4 space-y-4">
          <p className="text-[13px] text-zinc-300">
            Apaga o projeto, suas origens, capturas, assets e peças. Arquivos compartilhados com outros projetos são preservados.
            {project.origin === "legacy" && " A pasta do catálogo v1 não é tocada, e o projeto não volta na próxima sincronização."}
          </p>
          <Field label={`Digite "${project.slug}" para confirmar`} htmlFor="ps-confirm">
            <input
              id="ps-confirm"
              name="confirmation"
              autoComplete="off"
              className={INPUT_CLASS}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <FormError message={deleteState?.error} />
          <div className="flex justify-end">
            <Button type="submit" variant="danger" disabled={deleting || confirmation !== project.slug}>
              {deleting ? "Excluindo…" : "Excluir projeto"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
