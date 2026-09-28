/**
 * Relatório da biblioteca do Atlas v1 vista pelo modelo novo (2.1.D).
 * Somente leitura — não grava, move nem apaga nada em public/generated.
 *
 * Uso: npm run legacy:scan            (resumo legível)
 *      npm run legacy:scan -- --json  (relatório completo em JSON)
 */
import { legacyLibraryDir } from "../src/infrastructure/capture-settings";
import { GeneratedDirStore } from "../src/infrastructure/legacy/generated-dir-store";
import { scanLegacyLibrary } from "../src/modules/import/legacy/scan-legacy-library";

async function main(): Promise<void> {
  const report = await scanLegacyLibrary(await GeneratedDirStore.open(legacyLibraryDir()));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nBiblioteca legada: ${legacyLibraryDir()}`);
  console.log(`Pastas analisadas: ${report.scannedFolders} · projetos legíveis: ${report.projects.length}\n`);

  for (const p of report.projects) {
    const assets = p.files.filter((f) => f.target === "asset").length;
    const outputs = p.files.length - assets;
    const missing = p.fileStatus.filter((s) => !s.present).length;
    const mb = p.fileStatus.reduce((sum, s) => sum + (s.byteSize ?? 0), 0) / 1024 / 1024;
    console.log(
      `  ✓ ${p.slug.padEnd(24)} v${p.atlasVersion}  ${String(assets).padStart(3)} assets  ${String(outputs).padStart(2)} outputs` +
        `  ${mb.toFixed(1).padStart(6)} MB${missing ? `  ⚠ ${missing} ausentes` : ""}${p.caseDraftPresent ? "  · case-draft" : ""}`
    );
  }

  if (report.issues.length) {
    console.log("\nRessalvas:");
    for (const i of report.issues) {
      console.log(`  ${i.severity === "error" ? "✗" : "⚠"} [${i.code}] ${i.folder}: ${i.message.split("\n")[0]}`);
    }
  }
  console.log("");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
