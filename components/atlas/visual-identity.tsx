import type { VisualProfile } from "@/src/core/creative/visual-profile";

const TRAIT_LABEL: Record<string, string> = {
  dark: "escuro",
  light: "claro",
  colorful: "colorido",
  monochrome: "monocromático",
  "high-contrast": "alto contraste",
};

const SOURCE_LABEL: Record<VisualProfile["source"], string> = {
  inspection: "lido da captura",
  legacy: "importado do v1",
  manual: "ajustado à mão",
  brain: "sugerido pelo Atlas Brain",
};

/** Painel "Identidade visual" do VisualProfile atual (paleta, tipografia, tecnologias). */
export function VisualIdentity({ profile }: { profile: VisualProfile | null }) {
  if (!profile) {
    return <p className="text-[13px] text-cbm-gray-400">Ainda não lida. Uma captura com inspeção preenche paleta, fontes e tecnologias.</p>;
  }
  return (
    <div className="space-y-4">
      {profile.palette.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Paleta">
          {profile.palette.map((hex) => (
            <li key={hex} className="flex items-center gap-2 border border-line pr-2">
              <span className="w-7 h-7 border-r border-line" style={{ background: hex }} aria-hidden />
              <span className="text-[11px] font-mono text-cbm-gray-200">{hex}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="grid gap-2 text-[13px]">
        {profile.fonts.length > 0 && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-cbm-gray-400">Tipografia</dt>
            <dd className="text-cbm-gray-200">{profile.fonts.join(", ")}</dd>
          </div>
        )}
        {profile.techStack.length > 0 && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-cbm-gray-400">Tecnologias</dt>
            <dd className="text-cbm-gray-200">{profile.techStack.join(", ")}</dd>
          </div>
        )}
        {profile.traits.length > 0 && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-cbm-gray-400">Traços</dt>
            <dd className="text-cbm-gray-200">{profile.traits.map((t) => TRAIT_LABEL[t] ?? t).join(", ")}</dd>
          </div>
        )}
      </dl>
      <p className="text-[11px] text-cbm-gray-400">
        Revisão {profile.revision} · {SOURCE_LABEL[profile.source]} · {new Date(profile.createdAt).toLocaleDateString("pt-BR")}
      </p>
    </div>
  );
}
