import type { ReactNode } from "react";
import { Check, Download, FileText, Globe, Maximize2, Package, Presentation } from "lucide-react";
import { MediaThumb, thumbSrcSet } from "@/components/media/media-thumb";
import { FreshIn } from "@/components/media/fresh-in";
import { cleanOutputLabel } from "@/components/media/labels";
import { formatBytes } from "@/components/ui/format";
import type { Output } from "@/src/core/assets/output";

export const outputFileUrl = (id: string, download = false) => `/api/atlas/outputs/${id}/file${download ? "?download=1" : ""}`;
export const outputThumbUrl = (id: string, width: 320 | 640 | 1280 = 640) => `/api/atlas/outputs/${id}/thumb?w=${width}`;

type OutputKind = "image" | "video" | "document";

function kindOf(output: Output): OutputKind {
  if (output.mimeType.startsWith("image/")) return "image";
  if (output.mimeType.startsWith("video/")) return "video";
  return "document";
}

/** Nome do tipo para arquivos sem miniatura (PDF, PPTX, ZIP). */
function documentFace(output: Output): { icon: typeof FileText; label: string } {
  if (output.format === "pdf") return { icon: FileText, label: "Documento PDF" };
  if (output.format === "pptx") return { icon: Presentation, label: "Apresentação" };
  if (output.format === "zip" && output.metadata.caseModule === "web") return { icon: Globe, label: "Página web" };
  if (output.format === "zip") return { icon: Package, label: "Pacote" };
  return { icon: FileText, label: "Arquivo" };
}

/** "PNG · 1080×1350", "MP4 · 540×540 · prévia" — a especificação da entrega, sem tamanho em disco. */
export function outputDetail(output: Output): string {
  return [output.format.toUpperCase(), output.width && output.height ? `${output.width}×${output.height}` : null, output.metadata.quality === "preview" ? "prévia" : null]
    .filter(Boolean)
    .join(" · ");
}

const ACTION =
  "grid size-10 place-items-center border border-line bg-base/85 text-cbm-gray-200 transition-colors hover:border-cbm-gray-400 hover:text-cbm-white sm:size-8";

/**
 * Cartão de uma peça final — o mesmo em Entregar, Portfólio, kits e composições.
 * Moldura quadrada uniforme com a peça contida (grade alinhada, qualquer proporção);
 * vídeo aparece como pôster + Play + duração e só carrega ao abrir.
 *
 * Com `selectFor` (id do formulário de entrega) o cartão inteiro é a caixa de seleção:
 * um checkbox nativo transparente cobre a moldura (`name="outputId"` + atributo `form`,
 * então o FormData segue igual e teclado/leitor de tela funcionam de graça). Marcado:
 * contorno off-white + check no canto. Abrir e baixar ficam como ações no hover.
 */
export function OutputCard({
  output,
  compact = false,
  title,
  selectFor,
  footer,
  fresh = false,
}: {
  output: Output;
  compact?: boolean;
  /** Título já tratado (ex.: sem o prefixo do grupo). Padrão: o rótulo sem jargão. */
  title?: string;
  /** Id do formulário de entrega: torna o cartão selecionável. */
  selectFor?: string;
  /** Links extras sob o título (ex.: "Abrir no Studio"). */
  footer?: ReactNode;
  /** Recém-renderizada: entra com fade e um contorno que se apaga. */
  fresh?: boolean;
}) {
  const kind = kindOf(output);
  const name = title ?? cleanOutputLabel(output.label);
  const detail = outputDetail(output);
  const sizes = compact ? "(min-width: 1024px) 180px, (min-width: 640px) 25vw, 50vw" : "(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw";
  const face = kind === "document" ? documentFace(output) : null;

  return (
    <FreshIn fresh={fresh} className="group/card min-w-0">
      <div data-output={output.id} data-output-kind={kind} className="space-y-2">
        <div className="relative aspect-square">
          {selectFor ? (
            <input
              type="checkbox"
              name="outputId"
              value={output.id}
              form={selectFor}
              aria-label={`Incluir ${name}`}
              className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0"
              // O CSS global fixa checkbox em 16 px (fora de layer): o inline garante a cobertura total.
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <a href={outputFileUrl(output.id)} target="_blank" rel="noreferrer" aria-label={`Abrir ${name}`} className="peer absolute inset-0 z-10" />
          )}
          <div
            className={`absolute inset-0 overflow-hidden border border-line bg-surface-2 transition-[border-color,outline-color] duration-150 ease-out peer-hover:border-cbm-gray-400 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal ${
              selectFor ? "outline-1 outline-transparent peer-checked:border-cbm-white peer-checked:outline peer-checked:outline-cbm-white" : ""
            }`}
          >
            {face ? (
              <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                <face.icon size={compact ? 20 : 24} aria-hidden className="text-cbm-gray-400" />
                <span className="text-[12px] text-cbm-gray-200">{face.label}</span>
              </span>
            ) : (
              <span className={`block h-full w-full ${compact ? "p-2" : "p-3"}`}>
                <MediaThumb
                  src={outputThumbUrl(output.id, compact ? 320 : 640)}
                  srcSet={thumbSrcSet((w) => outputThumbUrl(output.id, w))}
                  sizes={sizes}
                  alt={name}
                  fit="contain"
                  video={kind === "video"}
                  durationMs={output.durationMs}
                  className="bg-transparent"
                />
              </span>
            )}
          </div>
          {selectFor && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-2 top-2 z-20 grid size-6 scale-90 place-items-center border border-cbm-gray-400 bg-base/85 text-transparent opacity-0 transition-[opacity,transform,background-color,border-color] duration-150 ease-out peer-hover:opacity-100 peer-focus-visible:opacity-100 peer-checked:scale-100 peer-checked:border-cbm-white peer-checked:bg-cbm-white peer-checked:text-cbm-black peer-checked:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
            >
              <Check size={14} strokeWidth={2.5} />
            </span>
          )}
          <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
            {selectFor && (
              <a href={outputFileUrl(output.id)} target="_blank" rel="noreferrer" aria-label={`Abrir ${name}`} title="Abrir" className={`${ACTION} [@media(hover:none)]:hidden`}>
                <Maximize2 size={14} aria-hidden />
              </a>
            )}
            <a href={outputFileUrl(output.id, true)} aria-label={`Baixar ${name}`} title={`Baixar · ${formatBytes(output.byteSize)}`} className={ACTION}>
              <Download size={14} aria-hidden />
            </a>
          </div>
        </div>
        <div className="min-w-0">
          <p className={`truncate text-cbm-gray-200 ${compact ? "text-[12px]" : "text-[13px]"}`} title={name}>
            {name}
          </p>
          <p className="truncate text-[12px] text-cbm-gray-400">{detail}</p>
          {footer}
        </div>
      </div>
    </FreshIn>
  );
}
