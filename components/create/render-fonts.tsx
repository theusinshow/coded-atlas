import path from "node:path";
import { fontFaceCss } from "@/src/render/fonts";

/** As fontes curadas do preview: os mesmos arquivos do render estático (Server Component). */
const FONT_CSS = fontFaceCss((f) => `/api/atlas/fonts/${encodeURIComponent(path.posix.basename(f.file))}`);

export function RenderFonts() {
  return (
    <style href="atlas-render-fonts" precedence="default">
      {FONT_CSS}
    </style>
  );
}
