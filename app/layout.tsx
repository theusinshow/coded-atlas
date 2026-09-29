import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/components/app-nav";
import { CommandPalette } from "@/components/command-palette";
import { MotionProvider } from "@/components/ui/motion";

export const metadata: Metadata = {
  title: "Coded Atlas",
  description: "Estúdio de mídia da Coded by M: captura, criação e entrega de peças a partir de projetos digitais.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <MotionProvider>
          <AppNav />
          {children}
          <CommandPalette />
        </MotionProvider>
      </body>
    </html>
  );
}
