import type { ProjectId, SourceId } from "../../shared/id";
import type { Project, ProjectOrigin, ProjectStatus, Slug } from "./project";
import type { Source } from "./source";

export interface ProjectQuery {
  /** Busca por termos (nome, slug, cliente, categoria, descrição) — sem acento, sem caixa. */
  text?: string;
  status?: ProjectStatus | "all";
  category?: string;
  origin?: ProjectOrigin;
  sort?: "recent" | "updated" | "name";
}

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
  search(query?: ProjectQuery): Promise<Project[]>;
  categories(): Promise<string[]>;
  /** Project é mutável simples: grava o estado inteiro e renova `updatedAt`. */
  update(project: Project): Promise<Project>;
  /** Remove o projeto e, em cascata, tudo que pertence a ele (bytes são tratados pelo serviço). */
  delete(id: ProjectId): Promise<void>;
}

export interface SourceRepository {
  create(source: Source): Promise<Source>;
  getById(id: SourceId): Promise<Source | null>;
  listByProject(projectId: ProjectId): Promise<Source[]>;
  delete(id: SourceId): Promise<void>;
}
