import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/components/app-nav";
import { CommandPalette } from "@/components/command-palette";

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
      <body className="antialiased">
        <AppNav />
        {children}
        <CommandPalette />
      </body>
    </html>
  );
}
