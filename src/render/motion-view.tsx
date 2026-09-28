/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { CSSProperties } from "react";
import type { Layer } from "../core/documents/layer";
import type { StyleTokens } from "../core/creative/tokens";
import { sceneAt, sceneFrame, type MotionContent, type Scene } from "../core/motion/motion";
import { ArtboardView } from "./artboard-view";

/**
 * Um quadro de uma cena de motion: `sceneFrame` (puro) + o mesmo ArtboardView do
 * estático. Escala vira transform (não mexe no layout); a transição de entrada
 * envolve a cena inteira. Usado no preview do Studio e no render de vídeo (2.10).
 */
export function MotionSceneView({
  scene,
  localMs,
  tokens,
  resolveAsset,
  mode = "render",
}: {
  scene: Scene;
  localMs: number;
  tokens: StyleTokens;
  resolveAsset: (assetId: string) => string | null;
  mode?: "preview" | "render";
}) {
  const frame = sceneFrame(scene, localMs);
  const layerStyle = (layer: Layer): CSSProperties | undefined => {
    const scale = frame.scales[layer.id];
    if (scale === undefined) return undefined;
    return { transform: `${layer.rotation ? `rotate(${layer.rotation}deg) ` : ""}scale(${scale})` };
  };
  const { enter } = frame;
  return (
    <div style={{ position: "relative", width: scene.artboard.width, height: scene.artboard.height, overflow: "hidden" }}>
      <div style={{ opacity: enter.opacity, transform: enter.dx || enter.scale !== 1 ? `translateX(${enter.dx}px) scale(${enter.scale})` : undefined, transformOrigin: "50% 50%" }}>
        <ArtboardView artboard={frame.artboard} tokens={tokens} resolveAsset={resolveAsset} mode={mode} layerStyle={layerStyle} />
      </div>
    </div>
  );
}

/**
 * Quadro de um vídeo inteiro em `timeMs`: durante a transição de entrada, a cena
 * anterior (no último instante) fica por baixo — transições cruzadas, sem piscar preto.
 */
export function MotionFrameView({
  content,
  timeMs,
  tokens,
  resolveAsset,
  mode = "render",
}: {
  content: MotionContent;
  timeMs: number;
  tokens: StyleTokens;
  resolveAsset: (assetId: string) => string | null;
  mode?: "preview" | "render";
}) {
  const { index, localMs } = sceneAt(content, timeMs);
  const scene = content.scenes[index];
  const previous = index > 0 ? content.scenes[index - 1] : null;
  const inTransition = previous && scene.transition.type !== "none" && localMs < scene.transition.durationMs;
  return (
    <div style={{ position: "relative", width: scene.artboard.width, height: scene.artboard.height, overflow: "hidden", background: "#000" }}>
      {inTransition && (
        <div style={{ position: "absolute", inset: 0 }}>
          <MotionSceneView scene={previous} localMs={previous.durationMs} tokens={tokens} resolveAsset={resolveAsset} mode={mode} />
        </div>
      )}
      <div style={{ position: "absolute", inset: 0 }}>
        <MotionSceneView scene={scene} localMs={localMs} tokens={tokens} resolveAsset={resolveAsset} mode={mode} />
      </div>
    </div>
  );
}
