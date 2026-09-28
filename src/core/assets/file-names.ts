/**
 * Nomes de arquivo seguros para download/ZIP: ASCII simples, sem separadores de
 * caminho nem `..` — nunca derivados de caminho de disco.
 */
export function safeFileBase(label: string | null | undefined, fallback: string, max = 80): string {
  const base = (label ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, max)
    .replace(/-+$/, "");
  return base || fallback;
}

export function safeFileName(label: string | null | undefined, extension: string, fallback: string): string {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${safeFileBase(label, fallback)}.${ext}`;
}
