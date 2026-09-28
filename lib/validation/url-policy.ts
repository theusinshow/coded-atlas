import { createUrlPolicy, resolveUrlPolicyMode } from "../../src/infrastructure/net/url-policy";
import { isDomainError } from "../../src/shared/errors";
import { AtlasError } from "../errors";

/**
 * Ponte do pipeline v1 para a política de URL central (src/core/projects/url-policy).
 * Em modo `local` (padrão) só confere o protocolo; em `hosted-safe` bloqueia
 * destinos internos. Converte a falha no AtlasError que a UI v1 já sabe exibir.
 */
export async function assertCapturableUrl(url: string): Promise<void> {
  try {
    await createUrlPolicy(resolveUrlPolicyMode()).assertAllowed(url);
  } catch (err) {
    if (isDomainError(err)) throw new AtlasError("INVALID_URL", "Esta URL não pode ser capturada nesta instalação.", err.message);
    throw err;
  }
}
