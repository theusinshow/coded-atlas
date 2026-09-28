import { redirect } from "next/navigation";

/** A casa do Atlas é a biblioteca de projetos (docs/UX-ARCHITECTURE.md). */
export default function HomePage(): never {
  redirect("/projects");
}
