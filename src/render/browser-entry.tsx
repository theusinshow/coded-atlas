/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import type { Artboard } from "../core/documents/artboard";
import type { StyleTokens } from "../core/creative/tokens";
import { ArtboardView } from "./artboard-view";

/**
 * Entrada do bundle que roda DENTRO do Chromium no render estático: lê os dados
 * injetados na página e desenha o Artboard com o mesmo componente do preview.
 * Empacotado por src/infrastructure/render/render-bundle.ts (esbuild).
 */
interface RenderPayload {
  artboard: Artboard;
  tokens: StyleTokens;
  origin: string;
}

declare global {
  interface Window {
    __ATLAS_RENDER__?: RenderPayload;
  }
}

const payload = window.__ATLAS_RENDER__;
const root = document.getElementById("root");
if (payload && root) {
  createRoot(root).render(
    <ArtboardView
      artboard={payload.artboard}
      tokens={payload.tokens}
      mode="render"
      resolveAsset={(id) => `${payload.origin}/asset/${encodeURIComponent(id)}`}
    />
  );
}
