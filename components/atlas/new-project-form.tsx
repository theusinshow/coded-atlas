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
  const [category, setCategory] = useState("");

  return (
    <form action={action} className="space-y-5">
      <Field label="URL do site" htmlFor="np-url" hint="Opcional — também aceita localhost.">
        <input
          id="np-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://site.com"
          className={`${INPUT_CLASS} font-mono`}
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
          <input
            id="np-category"
            name="category"
            required
            list="np-categories"
            maxLength={80}
            placeholder="Escolha…"
            autoComplete="off"
            className={INPUT_CLASS}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
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
      <label className={`flex min-h-10 items-center gap-2.5 text-sm transition-colors ${url ? "text-cbm-gray-200 cursor-pointer" : "text-cbm-gray-400"}`}>
        <input type="checkbox" name="captureNow" defaultChecked disabled={!url} />
        Capturar o site ao criar o projeto
      </label>
      <FormError message={state?.error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending || !name.trim() || !category.trim()} className="max-sm:w-full">
          {pending ? "Criando…" : "Criar projeto"}
        </Button>
      </div>
    </form>
  );
}
