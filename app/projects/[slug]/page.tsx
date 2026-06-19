import { promises as fs } from "node:fs";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { catalogPath, caseDraftPath } from "@/lib/storage/paths";
import type { Catalog } from "@/lib/types";
import { GeneratedGallery } from "@/components/generated-gallery";
import { AssetDownloadItems } from "@/components/asset-downloads";
import { CaseDraftSection } from "@/components/case-draft-section";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const raw = await fs.readFile(catalogPath(slug), "utf-8");
    const catalog = JSON.parse(raw) as Catalog;
    return { title: `${catalog.project.name} — Coded Atlas` };
  } catch {
    return { title: "Projeto — Coded Atlas" };
  }
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;

  const raw = await fs
    .readFile(catalogPath(slug), "utf-8")
    .catch(() => notFound());

  const catalog = JSON.parse(raw) as Catalog;
  const { project, captures, thumbnails, meta, createdAt } = catalog;

  const caseExists = await fs
    .access(caseDraftPath(slug))
    .then(() => true)
    .catch(() => false);
  const casePublicPath = caseExists ? `/generated/${slug}/case-draft.mdx` : undefined;

  const durationSec = (meta.durationMs / 1000).toFixed(1);
  const createdDate = new Date(createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-16">

        {/* ── Breadcrumb ── */}
        <nav
          aria-label="Navegação"
          className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest"
        >
          <Link href="/" className="hover:text-zinc-400 transition-colors">Coded by M</Link>
          <span aria-hidden>·</span>
          <Link href="/projects" className="hover:text-zinc-400 transition-colors">Atlas</Link>
          <span aria-hidden>·</span>
          <span className="text-zinc-500">{project.slug}</span>
        </nav>

        {/* ── Hero ── */}
        <section className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
          {/* Info */}
          <div className="space-y-4 min-w-0">
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                {project.category}
              </p>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
                {project.name}
              </h1>
              {project.client && (
                <p className="text-zinc-500 text-sm mt-1">{project.client}</p>
              )}
            </div>

            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 text-xs font-mono hover:text-zinc-300 transition-colors break-all block"
            >
              {project.url} ↗
            </a>

            {project.description && (
              <p className="text-zinc-400 text-sm leading-relaxed">
                {project.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
              <span className="text-[10px] font-mono text-zinc-600">{createdDate}</span>
              <span className="text-zinc-700 text-[10px]">·</span>
              <span className="text-[10px] font-mono text-zinc-600">{durationSec}s</span>
              <span className="text-zinc-700 text-[10px]">·</span>
              <span className="text-[10px] font-mono text-zinc-600">v{catalog.version}</span>
            </div>
          </div>

          {/* Thumbnails */}
          <div className="shrink-0 w-full md:w-72 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnails.main}
              alt={`${project.name} — thumbnail desktop`}
              className="w-full block border border-zinc-800"
              loading="eager"
            />
            <div className="flex gap-2 items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnails.mobile}
                alt={`${project.name} — thumbnail mobile`}
                className="w-20 block border border-zinc-800"
                loading="lazy"
              />
              <div className="text-[10px] font-mono text-zinc-600 pt-1 space-y-1">
                <p>640 × 400</p>
                <p>320 × 640</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Capa do catálogo ── */}
        {catalog.cover && (
          <div className="border-t border-zinc-800 pt-16">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Capa do catálogo
              </p>
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-wider">
                  {catalog.cover.source === "og-image" ? "og:image do site" : "smart crop · attention"}
                </span>
                <a
                  href={catalog.cover.image}
                  download
                  className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors uppercase tracking-wider cursor-pointer"
                >
                  Baixar →
                </a>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={catalog.cover.image}
              alt={`${project.name} — capa`}
              className="w-full block border border-zinc-800"
              style={{ aspectRatio: "1200/630", objectFit: "cover" }}
              loading="eager"
            />
          </div>
        )}

        {/* ── Desktop gallery ── */}
        <div className="border-t border-zinc-800 pt-16">
          <GeneratedGallery
            type="desktop"
            capture={captures.desktop}
            projectName={project.name}
          />
        </div>

        {/* ── Mobile gallery ── */}
        <div className="border-t border-zinc-800 pt-16">
          <GeneratedGallery
            type="mobile"
            capture={captures.mobile}
            projectName={project.name}
          />
        </div>

        {/* ── Section strips ── */}
        {catalog.sections && catalog.sections.length > 0 && (() => {
          const desktopSections = catalog.sections.filter(s => s.device === "desktop");
          const mobileSections  = catalog.sections.filter(s => s.device === "mobile");
          return (
            <div className="border-t border-zinc-800 pt-16 space-y-12">
              <div>
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-8">
                  Seções capturadas
                </p>

                {desktopSections.length > 0 && (
                  <div className="mb-8">
                    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                      Desktop · {desktopSections.length} seções
                    </p>
                    <div className="overflow-x-auto pb-3">
                      <div className="flex gap-3" style={{ width: "max-content" }}>
                        {desktopSections.map((section) => {
                          const label = section.suggestedName ?? section.heading ?? section.name;
                          return (
                            <div key={section.name} className="shrink-0 w-72 group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={section.screenshot}
                                alt={label}
                                className="w-full block border border-zinc-800 group-hover:border-zinc-600 transition-colors"
                                style={{ aspectRatio: "16/10", objectFit: "cover", objectPosition: "top" }}
                                loading="lazy"
                              />
                              <div className="flex items-baseline gap-2 mt-1.5">
                                {section.semanticTag && (
                                  <span className="text-[9px] font-mono text-zinc-700 uppercase shrink-0">
                                    &lt;{section.semanticTag}&gt;
                                  </span>
                                )}
                                <p className="text-[10px] font-mono text-zinc-500 truncate">
                                  {label}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {mobileSections.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
                      Mobile · {mobileSections.length} seções
                    </p>
                    <div className="overflow-x-auto pb-3">
                      <div className="flex gap-3" style={{ width: "max-content" }}>
                        {mobileSections.map((section) => {
                          const label = section.suggestedName ?? section.heading ?? section.name;
                          return (
                            <div key={section.name} className="shrink-0 w-32 group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={section.screenshot}
                                alt={label}
                                className="w-full block border border-zinc-800 group-hover:border-zinc-600 transition-colors"
                                style={{ aspectRatio: "9/16", objectFit: "cover", objectPosition: "top" }}
                                loading="lazy"
                              />
                              <div className="mt-1.5 space-y-0.5">
                                {section.semanticTag && (
                                  <span className="block text-[9px] font-mono text-zinc-700 uppercase">
                                    &lt;{section.semanticTag}&gt;
                                  </span>
                                )}
                                <p className="text-[10px] font-mono text-zinc-500 truncate">
                                  {label}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Vídeos ── */}
        {catalog.videos && (catalog.videos.desktop || catalog.videos.mobile) && (
          <div className="border-t border-zinc-800 pt-16">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-8">
              Gravações de scroll
            </p>
            <div className="grid md:grid-cols-2 gap-8">
              {catalog.videos.desktop && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Desktop</p>
                  <video
                    controls
                    preload="metadata"
                    className="w-full block border border-zinc-800"
                    style={{ maxHeight: "24rem" }}
                  >
                    <source src={catalog.videos.desktop} type="video/webm" />
                  </video>
                </div>
              )}
              {catalog.videos.mobile && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Mobile</p>
                  <video
                    controls
                    preload="metadata"
                    className="w-full block border border-zinc-800"
                    style={{ maxHeight: "24rem", objectFit: "contain", background: "#000" }}
                  >
                    <source src={catalog.videos.mobile} type="video/webm" />
                  </video>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Inspeção do site ── */}
        {catalog.inspection && (
          catalog.inspection.colors.length > 0 ||
          catalog.inspection.fonts.length > 0 ||
          catalog.inspection.techStack.length > 0
        ) && (
          <div className="border-t border-zinc-800 pt-16">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-8">
              Inspeção do site
            </p>
            <div className="grid md:grid-cols-3 gap-8">

              {/* Paleta */}
              {catalog.inspection.colors.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                    Paleta
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {catalog.inspection.colors.map((color) => (
                      <div
                        key={color}
                        title={color}
                        className="w-8 h-8 border border-zinc-800 shrink-0"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {catalog.inspection.colors.map((color) => (
                      <span key={color} className="text-[9px] font-mono text-zinc-600">
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tipografia */}
              {catalog.inspection.fonts.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                    Tipografia
                  </p>
                  <div className="space-y-2">
                    {catalog.inspection.fonts.map((font) => (
                      <div key={font} className="flex items-baseline gap-2">
                        <span
                          className="text-zinc-300 text-base leading-none"
                          style={{ fontFamily: font }}
                        >
                          Aa
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">{font}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tech Stack */}
              {catalog.inspection.techStack.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                    Tech Stack
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {catalog.inspection.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Downloads ── */}
        <div className="border-t border-zinc-800 pt-16">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">
            Downloads
          </p>
          <ul className="divide-y divide-zinc-800 border border-zinc-800">
            {/* ZIP — item destacado */}
            <li>
              <a
                href={`/api/zip/${slug}`}
                className="flex items-center justify-between px-4 py-3.5 text-zinc-200 hover:bg-zinc-900 hover:text-white transition-colors group cursor-pointer"
              >
                <span className="text-sm font-medium">
                  Baixar tudo (.zip)
                </span>
                <span className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  <span>ZIP</span>
                  <span>↓</span>
                </span>
              </a>
            </li>
            <AssetDownloadItems catalog={catalog} />
          </ul>
        </div>

        {/* ── Rascunho de case ── */}
        <div className="border-t border-zinc-800 pt-16">
          <CaseDraftSection slug={slug} existingPath={casePublicPath} />
        </div>

        {/* ── Footer ── */}
        <footer className="border-t border-zinc-800 pt-8 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            Coded Atlas · Coded by M
          </span>
          <a
            href="/generate"
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-wider cursor-pointer"
          >
            Gerar outro →
          </a>
        </footer>

      </div>
    </main>
  );
}
