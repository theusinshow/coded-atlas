/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import type { CaseContent } from "../core/case/case-document";
import type { StyleTokens } from "../core/creative/tokens";
import { CaseView } from "./case-view";

/**
 * Entrada do bundle que roda DENTRO do Chromium na exportação do case: desenha o
 * CaseView em modo publicação. Empacotado por render-bundle.ts (esbuild).
 */
declare global {
  interface Window {
    __ATLAS_CASE__?: { content: CaseContent; tokens: StyleTokens; origin: string };
  }
}

const payload = window.__ATLAS_CASE__;
const host = document.getElementById("root");
if (payload && host) {
  createRoot(host).render(
    <CaseView
      content={payload.content}
      tokens={payload.tokens}
      mode="publish"
      resolveAsset={(id) => `${payload.origin}/asset/${encodeURIComponent(id)}`}
      resolveOutput={(id) => `${payload.origin}/output/${encodeURIComponent(id)}`}
    />
  );
}
