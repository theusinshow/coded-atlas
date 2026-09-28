export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { NewProjectForm } from "@/components/atlas/new-project-form";
import { PageHeader } from "@/components/ui/primitives";
import { PROJECT_CATEGORIES } from "@/src/core/projects/categories";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Novo projeto — Coded Atlas" };

export default async function NewProjectPage() {
  const { repos } = await getAtlasRuntime();
  const categories = Array.from(new Set([...PROJECT_CATEGORIES.filter((c) => c !== "Outro"), ...(await repos.projects.categories())])).sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  );
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <PageHeader
        eyebrow="Novo projeto"
        title="Novo projeto"
        description="Comece pela URL do site para capturar automaticamente, ou crie vazio e envie imagens depois."
      />
      <NewProjectForm categories={categories} />
    </main>
  );
}
