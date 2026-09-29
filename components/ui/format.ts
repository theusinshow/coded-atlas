/**
 * Texto de interface em português, num lugar só (sem "peça(s)", sem jargão de
 * código). Puro — usado por Server e Client Components.
 */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** 10400 → "0:10"; 75000 → "1:15". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", "12/09". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "agora";
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86_400) return `há ${Math.round(diff / 3600)} h`;
  if (diff < 172_800) return "ontem";
  if (diff < 7 * 86_400) return `há ${Math.round(diff / 86_400)} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const ASSET_KIND_LABEL: Record<string, string> = {
  image: "Imagem",
  screenshot: "Captura",
  section: "Seção",
  video: "Vídeo",
  audio: "Áudio",
  logo: "Logo",
  icon: "Ícone",
  background: "Fundo",
  illustration: "Ilustração",
  font: "Fonte",
  document: "Documento",
  "motion-clip": "Clipe",
};

export const ASSET_ROLE_LABEL: Record<string, string> = {
  viewport: "Tela",
  fullpage: "Página inteira",
  section: "Seção",
  page: "Página extra",
  state: "Estado",
  cover: "Capa",
  thumbnail: "Miniatura",
  upload: "Enviado",
  diff: "Comparação",
};

export const DEVICE_LABEL: Record<string, string> = { desktop: "Desktop", mobile: "Celular" };

/** Título legível de um asset: nome da seção/página/estado, senão papel + dispositivo. */
export function assetTitle(a: { kind: string; label?: string | null; metadata: { role?: string; device?: string; sectionName?: string; pagePath?: string; stateName?: string; originalName?: string } }): string {
  const m = a.metadata;
  if (m.originalName) return m.originalName;
  if (m.role === "cover") return "Capa";
  if (m.sectionName) return m.sectionName;
  if (m.stateName) return `Estado: ${m.stateName}`;
  if (m.pagePath) return m.pagePath;
  const role = m.role ? ASSET_ROLE_LABEL[m.role] : undefined;
  if (role && m.device) return `${role} · ${DEVICE_LABEL[m.device] ?? m.device}`;
  if (role) return role;
  return a.label?.trim() || ASSET_KIND_LABEL[a.kind] || "Arquivo";
}

/** Linha de detalhe discreta: tipo · dispositivo (sem dimensões — elas ficam no detalhe). */
export function assetDetail(a: { kind: string; metadata: { device?: string } }): string {
  return [ASSET_KIND_LABEL[a.kind] ?? a.kind, a.metadata.device ? DEVICE_LABEL[a.metadata.device] ?? a.metadata.device : null].filter(Boolean).join(" · ");
}
