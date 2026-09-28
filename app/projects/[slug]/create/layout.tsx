import type { ReactNode } from "react";
import { RenderFonts } from "@/components/create/render-fonts";

export default function CreateLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RenderFonts />
      {children}
    </>
  );
}
