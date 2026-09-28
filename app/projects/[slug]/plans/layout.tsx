import type { ReactNode } from "react";
import { RenderFonts } from "@/components/create/render-fonts";

export default function PlansLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RenderFonts />
      {children}
    </>
  );
}
