"use client";
import { useState, type DragEvent } from "react";
import { FileImage, FileVideo, FileAudio, File as FileIcon, Upload, X } from "lucide-react";
import { formatBytes } from "@/components/ui/format";

/**
 * Área de soltar arquivos, ligada a um `<input type="file">` escondido pelo `htmlFor`
 * (o input continua sendo quem vai no FormData — nada de upload paralelo). Clicar
 * abre o seletor do sistema; soltar entrega a lista para quem é dono do input.
 */
export function FileDrop({ inputId, onDropFiles, hint }: { inputId: string; onDropFiles: (files: FileList) => void; hint?: string }) {
  const [over, setOver] = useState(false);

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length > 0) onDropFiles(e.dataTransfer.files);
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center transition-colors duration-150 ${
        over ? "border-cbm-white bg-surface-2" : "border-line hover:border-cbm-gray-400"
      }`}
    >
      <Upload size={18} aria-hidden className={over ? "text-cbm-white" : "text-cbm-gray-400"} />
      <span className="text-[13px] text-cbm-gray-200">
        Arraste arquivos aqui ou <span className="text-accent underline underline-offset-4">escolher arquivos</span>
      </span>
      {hint && <span className="text-[12px] text-cbm-gray-400">{hint}</span>}
    </label>
  );
}

function iconFor(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  return FileIcon;
}

/** Lista dos arquivos escolhidos, com remover um a um. */
export function SelectedFiles({ files, onRemove }: { files: readonly File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="divide-y divide-line border border-line" aria-label="Arquivos escolhidos">
      {files.map((file, i) => {
        const Icon = iconFor(file.type);
        return (
          <li key={`${file.name}-${file.size}-${i}`} className="flex items-center gap-3 pl-3">
            <Icon size={15} aria-hidden className="shrink-0 text-cbm-gray-400" />
            <span className="min-w-0 flex-1 truncate py-2 text-[13px] text-cbm-gray-200">{file.name}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-cbm-gray-400">{formatBytes(file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Tirar ${file.name}`}
              className="grid size-10 shrink-0 place-items-center text-cbm-gray-400 transition-colors hover:text-cbm-white sm:size-9"
            >
              <X size={15} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
