import { ASSET_KIND_LABEL, DEVICE_LABEL, assetTitle, plural } from "@/components/ui/format";

/**
 * Textos dos cartões de mídia (arquivos do projeto e peças finais) — em português,
 * sem metadado cru ("smart-crop", "rev 3", "preview"). Puro: Server e Client Components.
 */

interface AssetLike {
  kind: string;
  label: string | null;
  metadata: { role?: string; device?: string; sectionName?: string; pagePath?: string; stateName?: string; origin?: string; originalName?: string };
}

/** Título de um arquivo: o nome dado por quem enviou, senão o que a captura sabe dele. */
export function mediaTitle(a: AssetLike): string {
  const m = a.metadata;
  const device = m.device ? DEVICE_LABEL[m.device] ?? m.device : null;
  if (m.origin === "upload" || m.role === "upload") return a.label ?? m.originalName ?? ASSET_KIND_LABEL[a.kind] ?? "Arquivo";
  if (m.role === "cover") return a.label?.startsWith("Capa") ? a.label : "Capa";
  if (m.role === "diff") return a.label ?? "Comparação";
  if (m.role === "video" || (a.kind === "video" && !a.label)) return device ? `Rolagem · ${device}` : "Rolagem da página";
  // Nome gerado pela captura antiga ("section-002") não é nome: vira "Seção 2".
  const raw = /^section-(\d+)$/i.exec(m.sectionName ?? a.label ?? "");
  if (raw) return `Seção ${Number(raw[1])}`;
  return assetTitle(a);
}

/** Linha discreta sob o título: tipo · dispositivo, sem repetir o que o título já diz. */
export function mediaDetail(a: AssetLike): string {
  const title = mediaTitle(a);
  const device = a.metadata.device ? DEVICE_LABEL[a.metadata.device] ?? a.metadata.device : null;
  return [ASSET_KIND_LABEL[a.kind] ?? "Arquivo", device && !title.includes(device) ? device : null].filter(Boolean).join(" · ");
}

const SEP = " · ";

/** Tira o jargão do rótulo de uma peça: "· rev 3" some; "preview" → "prévia"; "3 página(s)" → "3 páginas". */
export function cleanOutputLabel(label: string | null | undefined): string {
  if (!label) return "Peça";
  return label
    .split(SEP)
    .filter((part, i) => !/^rev \d+$/i.test(part.trim()) && !(i > 0 && part.trim() === "vídeo"))
    .map((part) => {
      const t = part.trim();
      if (t === "preview") return "prévia";
      const pages = /^(\d+) página\(s\)$/.exec(t);
      return pages ? plural(Number(pages[1]), "página", "páginas") : t;
    })
    .join(SEP)
    .trim() || "Peça";
}

/**
 * Prefixo comum dos rótulos de um grupo ("Kit de portfólio · MJ Engenharia") — vai
 * para o cabeçalho do grupo, e cada cartão mostra só o que o distingue ("Destaque 16:9").
 */
export function commonLabelPrefix(labels: readonly string[]): string {
  if (labels.length < 2) return "";
  const split = labels.map((l) => l.split(SEP));
  const prefix: string[] = [];
  for (let i = 0; i < split[0].length - 1; i++) {
    const part = split[0][i];
    if (split.every((s) => s.length > i + 1 && s[i] === part)) prefix.push(part);
    else break;
  }
  return prefix.join(SEP);
}

/** O rótulo sem o prefixo do grupo. */
export function withoutPrefix(label: string, prefix: string): string {
  return prefix && label.startsWith(prefix + SEP) ? label.slice(prefix.length + SEP.length) : label;
}

/** Tira um trecho repetido do rótulo (ex.: o nome do projeto, já dito no cabeçalho da seção). */
export function withoutSegment(label: string, segment: string): string {
  const rest = label.split(SEP).filter((part) => part.trim() !== segment.trim());
  return rest.length > 0 ? rest.join(SEP) : label;
}
