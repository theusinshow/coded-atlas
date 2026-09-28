import { z } from "zod";
import { ProjectIdSchema, UlidSchema, newId, type ProjectId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * Memória criativa (docs/ATLAS-BRAIN.md → Creative memory): preferências da
 * Coded by M (workspace) e padrões aprovados/rejeitados de um projeto.
 * Precedência: pedido atual > projeto > workspace > padrões do Atlas.
 */
export const MemoryScopeSchema = z.enum(["workspace", "project"]);
export const MemoryPolaritySchema = z.enum(["prefer", "avoid", "note"]);
/** Sobre o que é a memória: uma composição do catálogo, um modo de estilo, ou texto livre. */
export const MemorySubjectSchema = z.enum(["composition", "style", "tone", "general"]);

export const CreativeMemoryIdSchema = UlidSchema.brand<"CreativeMemoryId">();
export type CreativeMemoryId = z.infer<typeof CreativeMemoryIdSchema>;

export const CreativeMemorySchema = z.strictObject({
  id: CreativeMemoryIdSchema,
  scope: MemoryScopeSchema,
  projectId: ProjectIdSchema.nullable(),
  polarity: MemoryPolaritySchema,
  subject: MemorySubjectSchema,
  /** composition → id da composição; style → project|atlas|hybrid; tone/general → texto. */
  value: z.string().trim().min(1).max(300),
  /** manual = escrito pelo Matheus; signal = aprendido de aplicar/descartar planos. */
  source: z.enum(["manual", "signal"]),
  /** Quantas vezes o sinal se repetiu (manual = 1). */
  weight: z.number().int().min(1).max(10_000),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CreativeMemory = z.infer<typeof CreativeMemorySchema>;

export function createMemory(input: Pick<CreativeMemory, "scope" | "projectId" | "polarity" | "subject" | "value"> & Partial<Pick<CreativeMemory, "source" | "weight">>): CreativeMemory {
  const now = nowIso();
  const memory = parseOrThrow(CreativeMemorySchema, { source: "manual", weight: 1, ...input, id: newId(), createdAt: now, updatedAt: now }, "Memória criativa");
  if ((memory.scope === "project") !== (memory.projectId !== null)) throw new Error("Memória de projeto precisa de projectId (e a de workspace não pode ter).");
  return memory;
}

export interface CreativeMemoryRepository {
  create(memory: CreativeMemory): Promise<CreativeMemory>;
  /** Memórias válidas para um projeto: as do workspace + as do projeto. */
  listFor(projectId: ProjectId | null): Promise<CreativeMemory[]>;
  listWorkspace(): Promise<CreativeMemory[]>;
  delete(id: CreativeMemoryId): Promise<void>;
  /** Soma um sinal (cria se não existir) — mesma chave: escopo+projeto+polaridade+assunto+valor. */
  bumpSignal(input: Pick<CreativeMemory, "scope" | "projectId" | "polarity" | "subject" | "value">): Promise<CreativeMemory>;
}

export interface ResolvedPreferences {
  /** Composições a evitar (a decisão mais específica vence). */
  avoidCompositions: Set<string>;
  /** Composições preferidas com peso (projeto conta mais que workspace). */
  preferCompositions: Map<string, number>;
  styleMode: "project" | "atlas" | "hybrid" | null;
  /** Notas em texto para o modelo, já em ordem de precedência. */
  notes: string[];
}

const SCOPE_WEIGHT = { project: 3, workspace: 1 } as const;

/**
 * Resolve as memórias em preferências concretas, respeitando a precedência:
 * para a mesma composição, o escopo de projeto vence o de workspace e, no mesmo
 * escopo, o manual vence o sinal aprendido.
 */
export function resolvePreferences(memories: readonly CreativeMemory[]): ResolvedPreferences {
  const rank = (m: CreativeMemory) => (m.scope === "project" ? 2 : 0) + (m.source === "manual" ? 1 : 0);
  const decided = new Map<string, CreativeMemory>();
  for (const m of memories.filter((x) => x.subject === "composition" && x.polarity !== "note")) {
    const current = decided.get(m.value);
    if (!current || rank(m) > rank(current) || (rank(m) === rank(current) && m.weight > current.weight)) decided.set(m.value, m);
  }
  const avoidCompositions = new Set<string>();
  const preferCompositions = new Map<string, number>();
  for (const [id, m] of decided) {
    if (m.polarity === "avoid") avoidCompositions.add(id);
    else preferCompositions.set(id, m.weight * SCOPE_WEIGHT[m.scope]);
  }
  const style = [...memories]
    .filter((m) => m.subject === "style" && m.polarity === "prefer" && ["project", "atlas", "hybrid"].includes(m.value))
    .sort((a, b) => rank(b) - rank(a) || b.weight - a.weight)[0];
  const notes = [...memories]
    .filter((m) => m.subject === "tone" || m.subject === "general" || (m.subject === "style" && m.polarity !== "prefer"))
    .sort((a, b) => rank(b) - rank(a))
    .map((m) => `${m.scope === "project" ? "Projeto" : "Coded by M"} — ${m.polarity === "avoid" ? "evitar" : m.polarity === "prefer" ? "preferir" : "nota"}: ${m.value}`);
  return { avoidCompositions, preferCompositions, styleMode: (style?.value as ResolvedPreferences["styleMode"]) ?? null, notes };
}
