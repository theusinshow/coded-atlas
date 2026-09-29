import { describe, expect, it } from "vitest";
import { INSTAGRAM, captionIssues, checkPieces, composeCaption, createSocialPost, normalizeHashtags, suggestHashtags, type PieceFacts } from "./social-post";

const img = (w: number, h: number, id = "i"): PieceFacts => ({ id, kind: "image", width: w, height: h, durationMs: null });
const vid = (w: number, h: number, ms: number): PieceFacts => ({ id: "v", kind: "video", width: w, height: h, durationMs: ms });

describe("posts do Instagram — regras", () => {
  it("post único: 1 imagem entre 4:5 e 1,91:1; avisa fora de 4:5/1:1", () => {
    expect(checkPieces("post", [img(1080, 1350)])).toEqual({ errors: [], warnings: [] });
    expect(checkPieces("post", [img(1080, 1080)]).errors).toEqual([]);
    expect(checkPieces("post", [img(1920, 1080)]).warnings[0]).toMatch(/4:5 ou 1:1/);
    expect(checkPieces("post", [img(1080, 1920)]).errors[0]).toMatch(/9:16 não cabe/);
    expect(checkPieces("post", [vid(1080, 1920, 5000)]).errors[0]).toMatch(/Reel/);
    expect(checkPieces("post", [img(1080, 1350), img(1080, 1350)]).errors[0]).toMatch(/exatamente 1/);
  });

  it("carrossel: 2 a 10 peças com a mesma proporção", () => {
    expect(checkPieces("carousel", [img(1080, 1350), img(1080, 1350)]).errors).toEqual([]);
    expect(checkPieces("carousel", [img(1080, 1350)]).errors[0]).toMatch(/2 a 10/);
    expect(checkPieces("carousel", [img(1080, 1350), img(1080, 1080)]).errors[0]).toMatch(/mesma proporção/);
    expect(checkPieces("carousel", Array.from({ length: 11 }, () => img(1080, 1080))).errors[0]).toMatch(/2 a 10/);
  });

  it("reel e story: vertical 9:16, durações recomendadas, peças sumidas bloqueiam", () => {
    expect(checkPieces("reel", [vid(1080, 1920, 30_000)])).toEqual({ errors: [], warnings: [] });
    expect(checkPieces("reel", [vid(1920, 1080, 120_000)]).warnings).toHaveLength(2);
    expect(checkPieces("reel", [img(1080, 1920)]).errors[0]).toMatch(/1 vídeo/);
    expect(checkPieces("story", [img(1080, 1920)])).toEqual({ errors: [], warnings: [] });
    expect(checkPieces("story", [vid(1080, 1920, 90_000)]).warnings[0]).toMatch(/60 s/);
    expect(checkPieces("story", [img(1080, 1350)]).warnings[0]).toMatch(/9:16/);
    expect(checkPieces("post", [img(1080, 1350)], 1).errors[0]).toMatch(/não existe mais/);
  });

  it("hashtags normalizadas, legenda final e limites", () => {
    expect(normalizeHashtags("#Web design, #web_design #WEB  ##ux-ui")).toEqual(["Web", "design", "web_design", "uxui"]);
    expect(composeCaption("  Novo site no ar.  ", ["codedbym", "webdesign"])).toBe("Novo site no ar.\n\n#codedbym #webdesign");
    expect(composeCaption("", ["a"])).toBe("#a");
    expect(captionIssues("x".repeat(INSTAGRAM.captionMax), ["tag"])[0]).toMatch(/máximo 2200/);
    expect(captionIssues("ok", Array.from({ length: 31 }, (_, i) => `t${i}`))[0]).toMatch(/31 hashtags/);
    expect(suggestHashtags(["Landing Page"])).toEqual(["codedbym", "webdesign", "desenvolvimentoweb", "landingpage", "conversao"]);
  });

  it("cria rascunho validado", () => {
    const post = createSocialPost({ kind: "post", title: "MJ · lançamento", outputIds: ["01ARZ3NDEKTSV4RRFFQ69G5FAV"], feedOrder: 0 });
    expect(post).toMatchObject({ status: "draft", caption: "", hashtags: [], plannedFor: null, postedAt: null });
    expect(() => createSocialPost({ kind: "post", title: "", outputIds: ["x"], feedOrder: 0 })).toThrow();
  });
});
