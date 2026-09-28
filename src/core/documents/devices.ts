/**
 * Medidas das molduras de device — usadas tanto pelas composições (para
 * calcular o tamanho) quanto pelo renderer (para desenhar). Uma fonte só.
 */

/** Altura da barra do navegador para uma janela de largura `width`. */
export function browserChromeHeight(width: number): number {
  return Math.round(Math.max(20, width * 0.034));
}

/** Espessura da borda (bezel) do celular para um corpo de largura `width`. */
export function phoneBezel(width: number): number {
  return Math.round(Math.max(4, width * 0.035));
}

/** Raio dos cantos do corpo do celular. */
export function phoneRadius(width: number): number {
  return Math.round(width * 0.15);
}

/** Tamanho da janela de navegador que mostra uma página de proporção `pageAspect` (largura/altura). */
export function browserSize(width: number, pageAspect: number): { width: number; height: number } {
  return { width, height: Math.round(width / pageAspect + browserChromeHeight(width)) };
}

/** Tamanho do corpo do celular para uma tela de proporção `screenAspect`. */
export function phoneSize(width: number, screenAspect: number): { width: number; height: number } {
  const bezel = phoneBezel(width);
  return { width, height: Math.round((width - 2 * bezel) / screenAspect + 2 * bezel) };
}
