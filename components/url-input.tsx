"use client";
import { useState } from "react";
import { slugify } from "@/lib/validation/slugify";
import type { ProjectInput } from "@/lib/types";

const INPUT =
  "w-full bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm px-3 py-2.5 " +
  "placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors";

const LABEL =
  "block text-[10px] font-mono text-zinc-500 tracking-widest uppercase mb-1.5";

interface Props {
  onSubmit: (input: ProjectInput) => void;
}

export function UrlInput({ onSubmit }: Props) {
  const [url, setUrl]               = useState("");
  const [name, setName]             = useState("");
  const [slug, setSlug]             = useState("");
  const [category, setCategory]     = useState("");
  const [client, setClient]         = useState("");
  const [description, setDescription] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [urlError, setUrlError]     = useState("");

  function handleNameChange(val: string) {
    setName(val);
    if (!slugEdited) setSlug(slugify(val));
  }

  function handleSlugChange(val: string) {
    setSlug(val);
    setSlugEdited(true);
  }

  function validateUrl(val: string): boolean {
    if (!val.trim()) {
      setUrlError("URL é obrigatória.");
      return false;
    }
    try {
      const u = new URL(val.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        setUrlError("URL deve começar com http:// ou https://");
        return false;
      }
    } catch {
      setUrlError("URL inválida. Use o formato https://exemplo.com");
      return false;
    }
    setUrlError("");
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateUrl(url)) return;
    const finalSlug = slug.trim() || slugify(name);
    if (!name.trim() || !finalSlug || !category.trim()) return;
    onSubmit({
      url: url.trim(),
      name: name.trim(),
      slug: finalSlug,
      category: category.trim(),
      client: client.trim() || undefined,
      description: description.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* URL */}
      <div>
        <label className={LABEL}>URL do projeto</label>
        <input
          type="url"
          value={url}
          onChange={e => {
            setUrl(e.target.value);
            if (urlError) validateUrl(e.target.value);
          }}
          onBlur={e => validateUrl(e.target.value)}
          placeholder="https://exemplo.com.br"
          required
          autoFocus
          className={`${INPUT} ${urlError ? "border-red-900 focus:border-red-700" : ""}`}
        />
        {urlError && (
          <p className="text-red-400 text-xs font-mono mt-1.5">{urlError}</p>
        )}
      </div>

      {/* Nome + Slug */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Nome do projeto</label>
          <input
            type="text"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Machado Plataformas"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>Slug</label>
          <input
            type="text"
            value={slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="machado-plataformas"
            required
            className={`${INPUT} font-mono text-zinc-400`}
          />
        </div>
      </div>

      {/* Categoria + Cliente */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Categoria</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Site Institucional"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL}>
            Cliente{" "}
            <span className="text-zinc-700 normal-case tracking-normal font-sans">(opcional)</span>
          </label>
          <input
            type="text"
            value={client}
            onChange={e => setClient(e.target.value)}
            placeholder="Nome do cliente"
            className={INPUT}
          />
        </div>
      </div>

      {/* Descrição */}
      <div>
        <label className={LABEL}>
          Descrição{" "}
          <span className="text-zinc-700 normal-case tracking-normal font-sans">(opcional)</span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descrição do projeto..."
          rows={3}
          className={`${INPUT} resize-none`}
        />
      </div>

      {/* Divider */}
      <div className="relative py-2">
        <div className="border-t border-zinc-800" />
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-block",
            width: 0,
            height: 0,
            borderTop: "4px solid transparent",
            borderBottom: "4px solid transparent",
            borderLeft: "6px solid rgb(113 113 122)",
          }}
        />
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
      >
        Gerar Catálogo →
      </button>
    </form>
  );
}
