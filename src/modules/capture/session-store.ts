import { z } from "zod";
import type { ProjectId } from "../../shared/id";

/**
 * Sessão autenticada de captura (cookies + localStorage no formato
 * `storageState` do navegador). Segredo vivo: fica FORA do AssetStorage, nunca vai
 * para banco, Output, pacote ou portfólio, e nunca é mostrada na UI — só o resumo.
 * Criada por um login manual do Matheus (`npm run atlas:login`).
 */
export const SessionStateSchema = z.object({
  cookies: z.array(z.record(z.string(), z.unknown())).max(2000),
  origins: z.array(z.object({ origin: z.string().max(2000) }).catchall(z.unknown())).max(200),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export interface SessionInfo {
  savedAt: string;
  cookieCount: number;
  /** Domínios dos cookies e origens do localStorage (sem valores). */
  domains: string[];
}

export interface SessionStore {
  get(projectId: ProjectId): Promise<SessionState | null>;
  info(projectId: ProjectId): Promise<SessionInfo | null>;
  save(projectId: ProjectId, state: SessionState): Promise<SessionInfo>;
  remove(projectId: ProjectId): Promise<boolean>;
}

/** Resumo exibível: nunca inclui valores de cookie nem de localStorage. */
export function summarizeSession(state: SessionState, savedAt: string): SessionInfo {
  const domains = new Set<string>();
  for (const c of state.cookies) if (typeof c.domain === "string") domains.add(c.domain.replace(/^\./, ""));
  for (const o of state.origins) {
    try {
      domains.add(new URL(o.origin).host);
    } catch {
      // origem malformada: fica fora do resumo
    }
  }
  return { savedAt, cookieCount: state.cookies.length, domains: [...domains].sort().slice(0, 20) };
}
