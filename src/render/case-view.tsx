/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { CSSProperties, ReactNode } from "react";
import { isPublishable, type CaseContent, type CaseSection } from "../core/case/case-document";
import { fontFamily, type StyleTokens } from "../core/creative/tokens";
import { browserChromeHeight, phoneBezel, phoneRadius } from "../core/documents/devices";

/**
 * O case como página editorial — o MESMO componente no preview do editor, na
 * página web exportada, no PDF e nos módulos estilo Behance (1400 px). Estilos
 * inline e fluidos (clamp) para funcionar sem CSS externo. `data-case-section`
 * marca cada módulo para captura.
 */
export interface CaseViewProps {
  content: CaseContent;
  tokens: StyleTokens;
  resolveAsset: (assetId: string) => string | null;
  resolveOutput: (outputId: string) => string | null;
  /** "edit" mostra seções de texto vazias como lembrete; "publish" as omite. */
  mode?: "edit" | "publish";
  /** Seção destacada no editor. */
  selectedId?: string | null;
}

const MAX = 1400;

export function CaseView({ content, tokens, resolveAsset, resolveOutput, mode = "publish", selectedId }: CaseViewProps) {
  const c = tokens.colors;
  const display = fontFamily("display", tokens);
  const body = fontFamily("body", tokens);
  const mono = fontFamily("mono", tokens);
  const { case: meta } = content;
  const pad = "clamp(20px, 5vw, 72px)";
  const sections = content.sections.filter((s) => mode === "edit" || isPublishable(s));
  const cover = meta.coverAssetId ? resolveAsset(meta.coverAssetId) : null;
  const ctx: SectionCtx = { tokens, resolveAsset, resolveOutput, mono, body, display, pad, mode, content };

  return (
    <article data-atlas-case="" style={{ background: c.background, color: c.text, fontFamily: body, WebkitFontSmoothing: "antialiased", minHeight: "100%" }}>
      <header data-case-section="hero" style={{ maxWidth: MAX, margin: "0 auto", padding: `clamp(48px, 9vw, 128px) ${pad} clamp(32px, 5vw, 64px)` }}>
        <p style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: c.primary, margin: 0 }}>
          {[meta.category, meta.year].filter(Boolean).join(" · ")}
        </p>
        <h1 style={{ fontFamily: display, fontSize: "clamp(40px, 7.2vw, 112px)", lineHeight: 1, letterSpacing: "-0.035em", fontWeight: 700, margin: "20px 0 0" }}>{meta.title}</h1>
        {meta.subtitle && <p style={{ fontSize: "clamp(17px, 1.6vw, 22px)", lineHeight: 1.55, color: c.textMuted, maxWidth: 760, margin: "28px 0 0" }}>{meta.subtitle}</p>}
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- kernel de render: <img> puro
          <img src={cover} alt={`Capa — ${meta.title}`} style={{ display: "block", width: "100%", marginTop: "clamp(32px, 5vw, 64px)", borderRadius: 18, boxShadow: "0 40px 80px -30px rgba(0,0,0,0.6)" }} />
        )}
      </header>
      {sections.map((section) => (
        <SectionFrame key={section.id} section={section} ctx={ctx} selected={section.id === selectedId} />
      ))}
      <footer data-case-section="footer" style={{ maxWidth: MAX, margin: "0 auto", padding: `clamp(48px, 7vw, 96px) ${pad}`, borderTop: `1px solid ${c.line}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16 }}>
        <span style={{ fontFamily: display, fontSize: 22, fontWeight: 600 }}>{meta.title}</span>
        <span style={{ fontFamily: mono, fontSize: 13, color: c.textMuted, letterSpacing: "0.08em" }}>
          {meta.url && <>{meta.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} · </>}Desenvolvido por Coded by M
        </span>
      </footer>
    </article>
  );
}

interface SectionCtx {
  tokens: StyleTokens;
  resolveAsset: (id: string) => string | null;
  resolveOutput: (id: string) => string | null;
  mono: string;
  body: string;
  display: string;
  pad: string;
  mode: "edit" | "publish";
  content: CaseContent;
}

function SectionFrame({ section, ctx, selected }: { section: CaseSection; ctx: SectionCtx; selected: boolean }) {
  const outline: CSSProperties = selected ? { outline: `2px solid ${ctx.tokens.colors.primary}`, outlineOffset: -2 } : {};
  return (
    <section data-case-section={section.id} data-case-type={section.type} style={{ maxWidth: MAX, margin: "0 auto", padding: `clamp(28px, 4.5vw, 64px) ${ctx.pad}`, ...outline }}>
      <SectionBody section={section} ctx={ctx} />
    </section>
  );
}

function Label({ children, ctx }: { children: ReactNode; ctx: SectionCtx }) {
  return <h2 style={{ fontFamily: ctx.mono, fontSize: 13, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: ctx.tokens.colors.primary, margin: 0 }}>{children}</h2>;
}

function Caption({ children, ctx }: { children: string; ctx: SectionCtx }) {
  return children ? <p style={{ fontFamily: ctx.mono, fontSize: 12, color: ctx.tokens.colors.textMuted, margin: "14px 0 0", letterSpacing: "0.04em" }}>{children}</p> : null;
}

function Picture({ src, alt, radius = 14 }: { src: string | null; alt: string; radius?: number }) {
  if (!src) return <div style={{ aspectRatio: "16 / 10", borderRadius: radius, background: "rgba(128,128,128,0.15)" }} />;
  // eslint-disable-next-line @next/next/no-img-element -- kernel de render
  return <img src={src} alt={alt} style={{ display: "block", width: "100%", borderRadius: radius }} />;
}

function SectionBody({ section, ctx }: { section: CaseSection; ctx: SectionCtx }): ReactNode {
  const c = ctx.tokens.colors;
  switch (section.type) {
    case "text": {
      const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px, 4vw, 64px)" }}>
          <div style={{ flex: "1 1 220px", maxWidth: 360 }}>
            <Label ctx={ctx}>{section.heading}</Label>
          </div>
          <div style={{ flex: "2 1 420px" }}>
            {paragraphs.length === 0 && ctx.mode === "edit" ? (
              <p style={{ fontSize: 18, color: c.textMuted, fontStyle: "italic", margin: 0 }}>Escreva este trecho no painel ao lado — vazio não é publicado.</p>
            ) : (
              paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: "clamp(18px, 1.7vw, 24px)", lineHeight: 1.6, margin: i ? "18px 0 0" : 0, color: i ? c.textMuted : c.text, whiteSpace: "pre-wrap" }}>
                  {p}
                </p>
              ))
            )}
          </div>
        </div>
      );
    }
    case "image": {
      const src = ctx.resolveAsset(section.assetId);
      if (section.frame === "phone") {
        const w = 320;
        const bezel = phoneBezel(w);
        return (
          <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: w, background: "#0b0b0e", borderRadius: phoneRadius(w), padding: bezel, boxShadow: `0 40px 70px -24px rgba(0,0,0,0.6), inset 0 0 0 1.5px ${c.line}` }}>
              <div style={{ borderRadius: phoneRadius(w) - bezel, overflow: "hidden", aspectRatio: "9 / 19.5", background: "#000" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- kernel de render */}
                {src && <img src={src} alt={section.caption || "Mobile"} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
              </div>
            </div>
            <Caption ctx={ctx}>{section.caption}</Caption>
          </figure>
        );
      }
      if (section.frame === "browser") {
        const chrome = browserChromeHeight(1200);
        return (
          <figure style={{ margin: 0 }}>
            <div style={{ borderRadius: 14, overflow: "hidden", background: c.surface, boxShadow: `0 40px 80px -30px rgba(0,0,0,0.6), inset 0 0 0 1px ${c.line}` }}>
              <div style={{ height: chrome, display: "flex", alignItems: "center", gap: 8, padding: "0 18px" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c.line }} />
                ))}
              </div>
              <Picture src={src} alt={section.caption || "Desktop"} radius={0} />
            </div>
            <Caption ctx={ctx}>{section.caption}</Caption>
          </figure>
        );
      }
      return (
        <figure style={{ margin: 0 }}>
          <Picture src={src} alt={section.caption || "Imagem"} />
          <Caption ctx={ctx}>{section.caption}</Caption>
        </figure>
      );
    }
    case "gallery":
      return (
        <figure style={{ margin: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "clamp(12px, 2vw, 24px)" }}>
            {section.assetIds.map((id) => (
              <Picture key={id} src={ctx.resolveAsset(id)} alt={section.caption || "Seção"} radius={12} />
            ))}
          </div>
          <Caption ctx={ctx}>{section.caption}</Caption>
        </figure>
      );
    case "piece":
      return (
        <figure style={{ margin: 0 }}>
          <Picture src={ctx.resolveOutput(section.outputId)} alt={section.caption || "Peça"} />
          <Caption ctx={ctx}>{section.caption}</Caption>
        </figure>
      );
    case "identity": {
      const { palette, fonts } = ctx.content.identity;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px, 4vw, 64px)" }}>
          <div style={{ flex: "1 1 220px", maxWidth: 360 }}>
            <Label ctx={ctx}>{section.heading}</Label>
          </div>
          <div style={{ flex: "2 1 420px" }}>
            {palette.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
                {palette.map((hex) => (
                  <div key={hex}>
                    <div style={{ aspectRatio: "4 / 3", borderRadius: 10, background: hex, boxShadow: `inset 0 0 0 1px ${c.line}` }} />
                    <p style={{ fontFamily: ctx.mono, fontSize: 12, color: c.textMuted, margin: "8px 0 0", textTransform: "uppercase" }}>{hex}</p>
                  </div>
                ))}
              </div>
            )}
            {fonts.length > 0 && <p style={{ fontFamily: ctx.display, fontSize: "clamp(28px, 3.4vw, 44px)", margin: "28px 0 0", letterSpacing: "-0.02em" }}>{fonts.join(" · ")}</p>}
          </div>
        </div>
      );
    }
    case "facts":
      return (
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px clamp(16px, 3vw, 48px)", margin: 0, borderTop: `1px solid ${c.line}`, paddingTop: 28 }}>
          {section.items.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              <dt style={{ fontFamily: ctx.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: c.textMuted }}>{item.label}</dt>
              <dd style={{ margin: "8px 0 0", fontSize: 18 }}>{item.value}</dd>
            </div>
          ))}
        </dl>
      );
  }
}
