import path from "node:path";
import type { ReactNode } from "react";
import { fontFaceCss } from "@/src/render/fonts";

/** As fontes curadas do preview: os mesmos arquivos do render estático. */
const FONT_CSS = fontFaceCss((f) => `/api/atlas/fonts/${encodeURIComponent(path.posix.basename(f.file))}`);

export default function CreateLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style href="atlas-render-fonts" precedence="default">
        {FONT_CSS}
      </style>
      {children}
    </>
  );
}
