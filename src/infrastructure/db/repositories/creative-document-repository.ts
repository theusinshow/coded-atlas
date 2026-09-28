import { and, desc, eq } from "drizzle-orm";
import {
  CanvasContentSchema,
  CreativeDocumentSchema,
  DocumentRevisionSchema,
  shouldCoalesce,
  type CanvasContent,
  type CommitResult,
  type CreativeDocument,
  type CreativeDocumentId,
  type CreativeDocumentRepository,
  type DocumentRevision,
  type RevisionOrigin,
  type RevisionSummary,
} from "../../../core/documents/creative-document";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { creativeDocuments, documentRevisions } from "../schema";
import { run, toDomain } from "./support";

type Tx = Parameters<Parameters<AtlasDb["transaction"]>[0]>[0];

const summaryColumns = {
  documentId: documentRevisions.documentId,
  revision: documentRevisions.revision,
  origin: documentRevisions.origin,
  pinned: documentRevisions.pinned,
  createdAt: documentRevisions.createdAt,
  updatedAt: documentRevisions.updatedAt,
};
const RevisionSummarySchema = DocumentRevisionSchema.omit({ content: true });

export class SqliteCreativeDocumentRepository implements CreativeDocumentRepository {
  constructor(private readonly db: AtlasDb) {}

  private tx<T>(op: (tx: Tx) => T): T {
    return run("Documento", () => this.db.transaction(op, { behavior: "immediate" }));
  }

  async create(document: CreativeDocument, content: CanvasContent, origin: RevisionOrigin): Promise<CommitResult> {
    const doc = parseOrThrow(CreativeDocumentSchema, { ...document, headRevision: 1 }, "Documento");
    const body = parseOrThrow(CanvasContentSchema, content, "Conteúdo do documento");
    const revision: RevisionSummary = { documentId: doc.id, revision: 1, origin, pinned: false, createdAt: doc.createdAt, updatedAt: doc.createdAt };
    this.tx((tx) => {
      tx.insert(creativeDocuments).values(doc).run();
      tx.insert(documentRevisions).values({ ...revision, content: body }).run();
    });
    return { document: doc, revision };
  }

  async getById(id: CreativeDocumentId): Promise<CreativeDocument | null> {
    const row = run("Documento", () => this.db.select().from(creativeDocuments).where(eq(creativeDocuments.id, id)).get());
    return row ? toDomain(CreativeDocumentSchema, row, "Documento") : null;
  }

  async listByProject(projectId: ProjectId): Promise<CreativeDocument[]> {
    const rows = run("Documento", () =>
      this.db.select().from(creativeDocuments).where(eq(creativeDocuments.projectId, projectId)).orderBy(desc(creativeDocuments.updatedAt)).all()
    );
    return rows.map((row) => toDomain(CreativeDocumentSchema, row, "Documento"));
  }

  async rename(id: CreativeDocumentId, name: string): Promise<CreativeDocument> {
    const current = await this.getById(id);
    if (!current) throw new DomainError("NOT_FOUND", "Documento não encontrado.", { id });
    const next = parseOrThrow(CreativeDocumentSchema, { ...current, name, updatedAt: nowIso() }, "Documento");
    run("Documento", () => this.db.update(creativeDocuments).set({ name: next.name, updatedAt: next.updatedAt }).where(eq(creativeDocuments.id, id)).run());
    return next;
  }

  async delete(id: CreativeDocumentId): Promise<void> {
    const result = run("Documento", () => this.db.delete(creativeDocuments).where(eq(creativeDocuments.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Documento não encontrado.", { id });
  }

  async getRevision(id: CreativeDocumentId, revision: number): Promise<DocumentRevision | null> {
    const row = run("Documento", () =>
      this.db
        .select()
        .from(documentRevisions)
        .where(and(eq(documentRevisions.documentId, id), eq(documentRevisions.revision, revision)))
        .get()
    );
    return row ? toDomain(DocumentRevisionSchema, row, "Revisão do documento") : null;
  }

  async listRevisions(id: CreativeDocumentId): Promise<RevisionSummary[]> {
    const rows = run("Documento", () =>
      this.db.select(summaryColumns).from(documentRevisions).where(eq(documentRevisions.documentId, id)).orderBy(desc(documentRevisions.revision)).all()
    );
    return rows.map((row) => toDomain(RevisionSummarySchema, row, "Revisão do documento"));
  }

  async commit(id: CreativeDocumentId, baseRevision: number, content: CanvasContent, origin: RevisionOrigin): Promise<CommitResult> {
    const body = parseOrThrow(CanvasContentSchema, content, "Conteúdo do documento");
    return this.tx((tx) => {
      const docRow = tx.select().from(creativeDocuments).where(eq(creativeDocuments.id, id)).get();
      if (!docRow) throw new DomainError("NOT_FOUND", "Documento não encontrado.", { id });
      const doc = toDomain(CreativeDocumentSchema, docRow, "Documento");
      if (doc.headRevision !== baseRevision) {
        throw new DomainError("CONFLICT", "O documento foi alterado em outra aba. Recarregue para continuar.", { head: doc.headRevision, base: baseRevision });
      }
      const headRow = tx
        .select(summaryColumns)
        .from(documentRevisions)
        .where(and(eq(documentRevisions.documentId, id), eq(documentRevisions.revision, doc.headRevision)))
        .get();
      if (!headRow) throw new DomainError("NOT_FOUND", "Revisão atual do documento não encontrada.", { id });
      const head = toDomain(RevisionSummarySchema, headRow, "Revisão do documento");
      const now = nowIso();

      let revision: RevisionSummary;
      if (shouldCoalesce(head, origin, new Date(now))) {
        tx.update(documentRevisions)
          .set({ content: body, updatedAt: now })
          .where(and(eq(documentRevisions.documentId, id), eq(documentRevisions.revision, head.revision)))
          .run();
        revision = { ...head, updatedAt: now };
      } else {
        revision = { documentId: doc.id, revision: head.revision + 1, origin, pinned: false, createdAt: now, updatedAt: now };
        tx.insert(documentRevisions).values({ ...revision, content: body }).run();
      }
      tx.update(creativeDocuments).set({ headRevision: revision.revision, updatedAt: now }).where(eq(creativeDocuments.id, id)).run();
      return { document: { ...doc, headRevision: revision.revision, updatedAt: now }, revision };
    });
  }

  async pin(id: CreativeDocumentId, revision: number): Promise<void> {
    const result = run("Documento", () =>
      this.db
        .update(documentRevisions)
        .set({ pinned: true })
        .where(and(eq(documentRevisions.documentId, id), eq(documentRevisions.revision, revision)))
        .run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Revisão não encontrada.", { id, revision });
  }
}
