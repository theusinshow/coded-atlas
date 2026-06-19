import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-16 flex flex-col">
      {/* Subtle technical grid — fixed */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-3xl mx-auto flex flex-col flex-1">

        {/* ── Header ── */}
        <header className="mb-24">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Coded by M · Laboratório
          </span>
        </header>

        {/* ── Hero ── */}
        <section className="space-y-8">
          <div>
            <p className="text-[10px] font-mono text-zinc-600 mb-3 flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 0,
                  height: 0,
                  borderTop: "4px solid transparent",
                  borderBottom: "4px solid transparent",
                  borderLeft: "6px solid rgb(113 113 122)",
                }}
              />
              v0.1.0 · Ferramenta interna
            </p>
            <h1 className="text-6xl font-mono font-bold tracking-tight text-zinc-100 leading-none">
              CODED<br />ATLAS
            </h1>
          </div>

          <div className="border-t border-zinc-800 pt-7 space-y-3">
            <p className="text-xl text-zinc-300 font-light leading-snug">
              Transforme uma URL em um catálogo visual de projeto.
            </p>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">
              Uma ferramenta interna da Coded by M para capturar sites,
              gerar screenshots em desktop e mobile e organizar assets
              visuais para cases de portfólio.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Link
              href="/generate"
              className="inline-block px-7 py-3 bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
            >
              Gerar Catálogo →
            </Link>
            <Link
              href="/projects"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Ver projetos
            </Link>
          </div>
        </section>

        {/* ── Como funciona ── */}
        <section className="mt-24">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-8">
            Como funciona
          </p>
          <div>
            {[
              {
                n: "01",
                title: "URL",
                desc: "Informe a URL do projeto e os metadados básicos: nome, slug, categoria.",
              },
              {
                n: "02",
                title: "Captura",
                desc: "Playwright abre o site e captura viewport e full page em desktop (1440px) e mobile (390px).",
              },
              {
                n: "03",
                title: "Catálogo",
                desc: "Screenshots PNG, thumbnails WebP e catalog.json organizados e prontos para o portfólio.",
              },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex gap-6 py-5 border-b border-zinc-800 last:border-b-0">
                <span className="text-[10px] font-mono text-zinc-600 w-5 shrink-0 pt-px">
                  {n}
                </span>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-300 font-medium">
                    <span className="text-zinc-500 mr-2" aria-hidden>▸</span>
                    {title}
                  </p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Saída (estrutura de arquivos) ── */}
        <section className="mt-16">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">
            Saída
          </p>
          <div className="border border-zinc-800 bg-zinc-900/60 px-5 py-4">
            <pre className="text-[11px] font-mono text-zinc-500 leading-[1.7]">{`public/generated/[slug]/
├─ catalog.json
├─ screenshots/
│  ├─ desktop-1440x900.png
│  ├─ desktop-fullpage.png
│  ├─ mobile-390x844.png
│  └─ mobile-fullpage.png
└─ thumbnails/
   ├─ thumb-main.webp   (640×400)
   └─ thumb-mobile.webp (320×640)`}</pre>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-auto pt-16">
          <div className="border-t border-zinc-800 pt-6 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Coded Atlas · Coded by M
            </span>
            <span className="text-[10px] font-mono text-zinc-600">v0.1.0</span>
          </div>
        </footer>

      </div>
    </main>
  );
}
