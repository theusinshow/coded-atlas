/** @jsxRuntime automatic */
/** @jsxImportSource react */
// ↑ O kernel roda fora do Next (worker via tsx, Remotion): declara o runtime JSX aqui.
import type { CSSProperties, ReactNode } from "react";
import type { Artboard } from "../core/documents/artboard";
import { browserChromeHeight, phoneBezel, phoneRadius } from "../core/documents/devices";
import type { BrowserLayer, DeviceLayer, Layer, Shadow, ShapeLayer, TextLayer, AssetLayer } from "../core/documents/layer";
import { fontFamily, resolveColor, type StyleTokens } from "../core/creative/tokens";

/**
 * Renderizador de Artboard em React com estilos inline — a única implementação
 * visual do Atlas. Usado no preview do navegador, no render estático
 * (renderToStaticMarkup → Playwright) e no motion (Remotion). Sem Next, sem
 * Tailwind, sem APIs de Node: só React e o domínio.
 */
export interface ArtboardViewProps {
  artboard: Artboard;
  tokens: StyleTokens;
  /** URL de um asset para <img>; `null` = indisponível. */
  resolveAsset: (assetId: string) => string | null;
  /** "preview" desenha placeholders em slots vazios; "render" os omite. */
  mode?: "preview" | "render";
  /** Estilo extra por layer (ex.: animação no motion). */
  layerStyle?: (layer: Layer) => CSSProperties | undefined;
}

function shadowCss(shadow: Shadow, s: number): string | undefined {
  switch (shadow) {
    case "soft":
      return `0 ${10 * s}px ${34 * s}px rgba(0,0,0,0.28)`;
    case "device":
      return `0 ${34 * s}px ${64 * s}px ${-18 * s}px rgba(0,0,0,0.55), 0 ${12 * s}px ${26 * s}px rgba(0,0,0,0.22)`;
    case "deep":
      return `0 ${56 * s}px ${100 * s}px ${-28 * s}px rgba(0,0,0,0.72), 0 ${18 * s}px ${36 * s}px rgba(0,0,0,0.3)`;
    case "none":
      return undefined;
  }
}

function patternCss(pattern: Artboard["background"]["pattern"], line: string, s: number): Pick<CSSProperties, "backgroundImage" | "backgroundSize"> {
  if (pattern === "grid") {
    const size = Math.round(48 * s);
    return {
      backgroundImage: `linear-gradient(${line}22 1px, transparent 1px), linear-gradient(90deg, ${line}22 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
    };
  }
  if (pattern === "dots") {
    const size = Math.round(28 * s);
    return { backgroundImage: `radial-gradient(${line}55 1px, transparent 1.5px)`, backgroundSize: `${size}px ${size}px` };
  }
  return {};
}

export function ArtboardView({ artboard, tokens, resolveAsset, mode = "render", layerStyle }: ArtboardViewProps) {
  const s = Math.min(artboard.width, artboard.height) / 1080;
  const ctx: RenderContext = { tokens, resolveAsset, mode, s, layerStyle };
  return (
    <div
      data-atlas-artboard=""
      style={{
        position: "relative",
        width: artboard.width,
        height: artboard.height,
        overflow: "hidden",
        backgroundColor: resolveColor(artboard.background.fill, tokens),
        ...patternCss(artboard.background.pattern, tokens.colors.line, s),
        fontFamily: fontFamily("body", tokens),
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {artboard.layers.map((layer) => (
        <LayerView key={layer.id} layer={layer} ctx={ctx} />
      ))}
    </div>
  );
}

interface RenderContext {
  tokens: StyleTokens;
  resolveAsset: (assetId: string) => string | null;
  mode: "preview" | "render";
  s: number;
  layerStyle?: (layer: Layer) => CSSProperties | undefined;
}

function frameStyle(layer: Layer, ctx: RenderContext): CSSProperties {
  return {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
    ...ctx.layerStyle?.(layer),
  };
}

function LayerView({ layer, ctx }: { layer: Layer; ctx: RenderContext }): ReactNode {
  if (!layer.visible) return null;
  switch (layer.type) {
    case "asset":
      return <AssetView layer={layer} ctx={ctx} />;
    case "text":
      return <TextView layer={layer} ctx={ctx} />;
    case "shape":
      return <ShapeView layer={layer} ctx={ctx} />;
    case "device":
      return <PhoneView layer={layer} ctx={ctx} />;
    case "browser":
      return <BrowserView layer={layer} ctx={ctx} />;
    case "group":
      return (
        <div style={frameStyle(layer, ctx)}>
          {layer.children.map((child) => (
            <LayerView key={child.id} layer={child} ctx={ctx} />
          ))}
        </div>
      );
  }
}

/** Imagem cortada/encaixada, ou placeholder no preview. */
function Picture({ assetId, fit, focusY, ctx, radius }: { assetId: string | null; fit: "cover" | "contain"; focusY: number; ctx: RenderContext; radius: number }) {
  const src = assetId ? ctx.resolveAsset(assetId) : null;
  if (!src) {
    if (ctx.mode === "render") return null;
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
          border: `${Math.max(1, 2 * ctx.s)}px dashed ${ctx.tokens.colors.line}`,
          background: ctx.tokens.colors.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: ctx.tokens.colors.textMuted,
          fontFamily: fontFamily("mono", ctx.tokens),
          fontSize: Math.max(10, 18 * ctx.s),
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        sem imagem
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- kernel de render: <img> puro, sem otimizador
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ width: "100%", height: "100%", display: "block", objectFit: fit, objectPosition: `50% ${Math.round(focusY * 100)}%`, borderRadius: radius }}
    />
  );
}

function AssetView({ layer, ctx }: { layer: AssetLayer; ctx: RenderContext }) {
  return (
    <div style={{ ...frameStyle(layer, ctx), borderRadius: layer.radius, overflow: "hidden", boxShadow: shadowCss(layer.shadow, ctx.s) }}>
      <Picture assetId={layer.assetId} fit={layer.fit} focusY={layer.focusY} ctx={ctx} radius={0} />
    </div>
  );
}

function TextView({ layer, ctx }: { layer: TextLayer; ctx: RenderContext }) {
  return (
    <div
      style={{
        ...frameStyle(layer, ctx),
        color: resolveColor(layer.color, ctx.tokens),
        fontFamily: fontFamily(layer.font, ctx.tokens),
        fontSize: layer.size,
        fontWeight: layer.weight,
        lineHeight: layer.lineHeight,
        letterSpacing: `${layer.letterSpacing}em`,
        textAlign: layer.align,
        textTransform: layer.uppercase ? "uppercase" : undefined,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        ...(layer.maxLines ? { display: "-webkit-box", WebkitLineClamp: layer.maxLines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}),
      }}
    >
      {layer.text}
    </div>
  );
}

function ShapeView({ layer, ctx }: { layer: ShapeLayer; ctx: RenderContext }) {
  const fill = layer.fill ? resolveColor(layer.fill, ctx.tokens) : "transparent";
  const border = layer.stroke && layer.strokeWidth ? `${layer.strokeWidth}px solid ${resolveColor(layer.stroke, ctx.tokens)}` : undefined;
  return (
    <div
      style={{
        ...frameStyle(layer, ctx),
        background: fill,
        border,
        borderRadius: layer.shape === "ellipse" ? "50%" : layer.radius,
        boxShadow: shadowCss(layer.shadow, ctx.s),
        boxSizing: "border-box",
      }}
    />
  );
}

function PhoneView({ layer, ctx }: { layer: DeviceLayer; ctx: RenderContext }) {
  const bezel = phoneBezel(layer.width);
  const radius = phoneRadius(layer.width);
  const body = layer.frame === "light" ? "#e9e9ec" : "#0b0b0e";
  const rim = layer.frame === "light" ? "#c9c9cf" : "#2a2d35";
  return (
    <div
      style={{
        ...frameStyle(layer, ctx),
        background: body,
        borderRadius: radius,
        padding: bezel,
        boxSizing: "border-box",
        boxShadow: [shadowCss(layer.shadow, ctx.s), `inset 0 0 0 ${Math.max(1, layer.width * 0.004)}px ${rim}`].filter(Boolean).join(", "),
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: radius - bezel, overflow: "hidden", background: "#000" }}>
        <Picture assetId={layer.assetId} fit="cover" focusY={layer.focusY} ctx={ctx} radius={0} />
        <div
          style={{
            position: "absolute",
            top: layer.width * 0.03,
            left: "50%",
            transform: "translateX(-50%)",
            width: layer.width * 0.28,
            height: layer.width * 0.075,
            borderRadius: layer.width,
            background: "#050506",
          }}
        />
      </div>
    </div>
  );
}

function BrowserView({ layer, ctx }: { layer: BrowserLayer; ctx: RenderContext }) {
  const chrome = browserChromeHeight(layer.width);
  const dark = layer.theme === "dark";
  const bar = dark ? "#16181d" : "#f1f1f3";
  const dot = dark ? "#3a3e47" : "#c8c8ce";
  const pill = dark ? "#23262d" : "#e2e2e6";
  const urlColor = dark ? "#8a909b" : "#6b6f77";
  const dotSize = chrome * 0.24;
  return (
    <div
      style={{
        ...frameStyle(layer, ctx),
        background: bar,
        borderRadius: layer.radius,
        overflow: "hidden",
        boxShadow: [shadowCss(layer.shadow, ctx.s), `inset 0 0 0 1px ${dark ? "#2a2d35" : "#d4d4d8"}`].filter(Boolean).join(", "),
      }}
    >
      <div style={{ height: chrome, display: "flex", alignItems: "center", gap: dotSize * 0.7, padding: `0 ${chrome * 0.45}px` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        ))}
        {layer.url && (
          <span
            style={{
              marginLeft: chrome * 0.5,
              flex: 1,
              maxWidth: "46%",
              height: chrome * 0.52,
              borderRadius: chrome,
              background: pill,
              color: urlColor,
              fontFamily: fontFamily("mono", ctx.tokens),
              fontSize: chrome * 0.3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {layer.url}
          </span>
        )}
      </div>
      <div style={{ height: layer.height - chrome, overflow: "hidden" }}>
        <Picture assetId={layer.assetId} fit="cover" focusY={layer.focusY} ctx={ctx} radius={0} />
      </div>
    </div>
  );
}
