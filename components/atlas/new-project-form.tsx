"use client";
import { useActionState, useState } from "react";
import { createProjectAction, type ActionState } from "@/app/actions/projects";
import { Button, Field, FormError, INPUT_CLASS } from "@/components/ui/primitives";

/** Sugere um nome a partir do domínio (só sugestão, editável). */
function nameFromUrl(url: string): string {
  try {
    const label = new URL(url).host.replace(/^www\./, "").split(".")[0] ?? "";
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
  } catch {
    return "";
  }
}

export function NewProjectForm({ categories }: { categories: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProjectAction, null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <Field label="URL do site" htmlFor="np-url" hint="Opcional. Site publicado ou servidor de desenvolvimento (http://localhost:3000).">
        <input
          id="np-url"
          name="url"
          type="url"
          placeholder="https://site.com"
          className={INPUT_CLASS}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (!nameEdited) setName(nameFromUrl(e.target.value));
          }}
        />
      </Field>
      <Field label="Nome" htmlFor="np-name">
        <input
          id="np-name"
          name="name"
          required
          maxLength={200}
          className={INPUT_CLASS}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categoria" htmlFor="np-category">
          <input id="np-category" name="category" required list="np-categories" defaultValue={categories[0] ?? ""} maxLength={80} className={INPUT_CLASS} />
          <datalist id="np-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Cliente" htmlFor="np-client">
          <input id="np-client" name="client" maxLength={200} className={INPUT_CLASS} />
        </Field>
      </div>
      <Field label="Descrição" htmlFor="np-description">
        <textarea id="np-description" name="description" rows={3} maxLength={2000} className={INPUT_CLASS} />
      </Field>
      <label className="flex items-center gap-2.5 text-sm text-zinc-300">
        <input type="checkbox" name="captureNow" defaultChecked disabled={!url} className="accent-[var(--color-accent)]" />
        Capturar o site assim que o projeto for criado
      </label>
      <FormError message={state?.error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
          {pending ? "Criando…" : "Criar projeto"}
        </Button>
      </div>
    </form>
  );
}
