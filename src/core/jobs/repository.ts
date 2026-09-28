import type { JobId, ProjectId } from "../../shared/id";
import type { Job, JobStatus, JobTransitionPatch } from "./job";

export interface JobRepository {
  create(job: Job): Promise<Job>;
  getById(id: JobId): Promise<Job | null>;
  listByProject(projectId: ProjectId): Promise<Job[]>;
  /**
   * Lê o estado atual, aplica `transitionJob` e grava — atomicamente.
   * NOT_FOUND se o job não existir; INVALID_TRANSITION se a mudança não valer.
   */
  transition(id: JobId, to: JobStatus, patch?: JobTransitionPatch): Promise<Job>;
}
