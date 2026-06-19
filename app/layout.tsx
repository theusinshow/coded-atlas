import type { Metadata } from "next";
import "./globals.css";
import { GenerationToast } from "@/components/generation-toast";

export const metadata: Metadata = {
  title: "Coded Atlas",
  description: "Transforme uma URL em um catálogo visual de projeto.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <GenerationToast />
      </body>
    </html>
  );
}
