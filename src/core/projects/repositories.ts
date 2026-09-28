import type { ProjectId, SourceId } from "../../shared/id";
import type { Project, Slug } from "./project";
import type { Source } from "./source";

/**
 * Portas de persistência do domínio de projetos. A implementação (Drizzle/SQLite)
 * vive em src/infrastructure/db — o domínio nunca importa o driver.
 * Toda leitura devolve objetos já validados pelo schema Zod.
 */
export interface ProjectRepository {
  /** Falha com CONFLICT se o slug já estiver em uso. */
  create(project: Project): Promise<Project>;
  getById(id: ProjectId): Promise<Project | null>;
  getBySlug(slug: Slug): Promise<Project | null>;
  list(options?: { includeArchived?: boolean }): Promise<Project[]>;
  /** Project é mutável simples: grava o estado inteiro e renova `updatedAt`. */
  update(project: Project): Promise<Project>;
}

export interface SourceRepository {
  create(source: Source): Promise<Source>;
  getById(id: SourceId): Promise<Source | null>;
  listByProject(projectId: ProjectId): Promise<Source[]>;
}
