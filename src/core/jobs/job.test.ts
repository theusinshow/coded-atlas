import { describe, expect, it } from "vitest";
import { isDomainError } from "../../shared/errors";
import { canTransition, createJob, JOB_TYPE_POLICY, JobSchema, JobStatusSchema, transitionJob } from "./job";

describe("Job", () => {
  it("nasce queued, progresso 0, sem lock", () => {
    const job = createJob({ type: "capture", payload: { sourceId: "x" } });
    expect(JobSchema.parse(job)).toEqual(job);
    expect(job.status).toBe("queued");
    expect(job.progress).toBe(0);
    expect(job.lockedBy).toBeNull();
  });

  it("captura é destrutiva por política (substitui o estado do projeto)", () => {
    expect(JOB_TYPE_POLICY.capture.destructive).toBe(true);
    expect(createJob({ type: "capture" }).destructive).toBe(true);
    expect(JobSchema.safeParse({ ...createJob({ type: "capture" }), destructive: "sim" }).success).toBe(false);
  });

  it("caminho feliz queued → preparing → running → completed", () => {
    let job = createJob({ type: "capture" });
    job = transitionJob(job, "preparing");
    job = transitionJob(job, "running", { progress: 40, message: "capturando" });
    expect(job.startedAt).not.toBeNull();
    expect(job.finishedAt).toBeNull();
    expect(job.progress).toBe(40);
    job = transitionJob(job, "completed", { result: { assets: 2 } });
    expect(job.progress).toBe(100);
    expect(job.finishedAt).not.toBeNull();
    expect(job.result).toEqual({ assets: 2 });
  });

  it("estados terminais não saem do lugar", () => {
    for (const terminal of ["completed", "failed", "cancelled"] as const) {
      for (const to of JobStatusSchema.options) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it("transição inválida lança INVALID_TRANSITION", () => {
    const job = createJob({ type: "capture" });
    try {
      transitionJob(job, "completed");
      expect.unreachable();
    } catch (err) {
      expect(isDomainError(err, "INVALID_TRANSITION")).toBe(true);
    }
  });

  it("cancelamento é possível de qualquer estado não-terminal", () => {
    for (const from of ["queued", "preparing", "running"] as const) expect(canTransition(from, "cancelled")).toBe(true);
  });

  it("progresso fora de 0–100 é rejeitado", () => {
    const job = transitionJob(transitionJob(createJob({ type: "capture" }), "preparing"), "running");
    expect(() => transitionJob(job, "failed", { progress: 150 })).toThrow();
  });
});
