import type { AtlasDb } from "../client";
import { SqliteAssetRepository } from "./asset-repository";
import { SqliteAiUsageRepository, SqliteCreativePlanRepository } from "./brain-repositories";
import { SqliteCaptureRepository } from "./capture-repository";
import { SqliteCompositionInstanceRepository } from "./composition-instance-repository";
import { SqliteCreativeDirectionRepository, SqliteCreativeMemoryRepository } from "./creative-repositories";
import { SqliteCreativeDocumentRepository } from "./creative-document-repository";
import { SqliteJobRepository } from "./job-repository";
import { SqliteLegacyImportLedger } from "./legacy-ledger-repository";
import { SqliteOutputRepository } from "./output-repository";
import { SqliteProjectRepository } from "./project-repository";
import { SqliteSourceRepository } from "./source-repository";
import { SqliteVisualProfileRepository } from "./visual-profile-repository";

export function createRepositories(db: AtlasDb) {
  return {
    projects: new SqliteProjectRepository(db),
    sources: new SqliteSourceRepository(db),
    assets: new SqliteAssetRepository(db),
    captures: new SqliteCaptureRepository(db),
    jobs: new SqliteJobRepository(db),
    outputs: new SqliteOutputRepository(db),
    legacyImports: new SqliteLegacyImportLedger(db),
    visualProfiles: new SqliteVisualProfileRepository(db),
    compositionInstances: new SqliteCompositionInstanceRepository(db),
    documents: new SqliteCreativeDocumentRepository(db),
    plans: new SqliteCreativePlanRepository(db),
    aiUsage: new SqliteAiUsageRepository(db),
    memory: new SqliteCreativeMemoryRepository(db),
    directions: new SqliteCreativeDirectionRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
