/**
 * "Próximo passo" da Visão geral (docs/UX-ARCHITECTURE.md → Overview): a partir do
 * que o projeto já tem, UMA ação recomendada e o estado dos 3 passos
 * (Material → Criar → Entregar). Pura: a página só fornece as contagens.
 */
export interface ProjectProgress {
  hasSiteSource: boolean;
  assets: number;
  kits: number;
  renderedKits: number;
  /** Primeiro kit ainda não renderizado (para o link direto). */
  pendingKitId: string | null;
  cases: number;
  documents: number;
  outputs: number;
  exports: number;
}

export type StepKey = "material" | "create" | "deliver";

export interface NextStep {
  step: StepKey | "done";
  title: string;
  detail: string;
  cta: string;
  /** Caminho relativo ao projeto ("" = visão geral). */
  href: string;
}

export interface StepStatus {
  key: StepKey;
  number: 1 | 2 | 3;
  label: string;
  done: boolean;
  summary: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function nextStep(p: ProjectProgress): NextStep {
  if (p.assets === 0 && !p.hasSiteSource) {
    return { step: "material", title: "Adicione o site do projeto", detail: "Com a URL, o Atlas captura as telas e entende a identidade visual.", cta: "Adicionar origem", href: "#origens" };
  }
  if (p.assets === 0) {
    return { step: "material", title: "Capture o site", detail: "Desktop, mobile, página inteira e seções — a matéria-prima de todas as peças.", cta: "Capturar agora", href: "capture" };
  }
  if (p.kits === 0) {
    return { step: "create", title: "Gere o Media Kit", detail: "Um conjunto de peças prontas (posts, 16:9, identidade, vídeo) com a mesma direção criativa.", cta: "Gerar Media Kit", href: "kits" };
  }
  if (p.renderedKits === 0 && p.pendingKitId) {
    return { step: "create", title: "Renderize o Media Kit", detail: "As peças estão montadas como rascunho — falta gerar os arquivos finais.", cta: "Abrir o kit", href: `kits/${p.pendingKitId}` };
  }
  if (p.cases === 0) {
    return { step: "create", title: "Monte o case", detail: "Uma página editorial do projeto (web, PDF e módulos para Behance), montada com o material.", cta: "Montar case", href: "cases" };
  }
  if (p.exports === 0) {
    return { step: "deliver", title: "Entregue as peças", detail: "Escolha as peças e crie um pacote organizado (ZIP, pasta ou GitHub).", cta: "Ir para Entregar", href: "publish" };
  }
  return { step: "done", title: "Projeto em dia", detail: "Material, peças e entregas prontos. Recapture o site quando ele mudar.", cta: "Ver entregas", href: "publish" };
}

export function stepStatuses(p: ProjectProgress): StepStatus[] {
  const created = p.kits + p.cases + p.documents;
  return [
    { key: "material", number: 1, label: "Material", done: p.assets > 0, summary: p.assets > 0 ? plural(p.assets, "imagem", "imagens") : "nenhuma captura", href: "assets" },
    {
      key: "create",
      number: 2,
      label: "Criar",
      done: p.renderedKits > 0 || p.outputs > 0,
      summary: created > 0 ? [p.kits && plural(p.kits, "kit", "kits"), p.cases && plural(p.cases, "case", "cases"), p.documents && plural(p.documents, "documento", "documentos")].filter(Boolean).join(" · ") : "nada criado",
      href: "create",
    },
    { key: "deliver", number: 3, label: "Entregar", done: p.exports > 0, summary: p.outputs > 0 ? `${plural(p.outputs, "peça", "peças")}${p.exports ? ` · ${plural(p.exports, "entrega", "entregas")}` : ""}` : "sem peças", href: "publish" },
  ];
}
