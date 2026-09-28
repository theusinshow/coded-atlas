import { PDFDocument } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import type { DocumentExporter, ExportMeta, ExportPage } from "../../modules/render/document-exporter";

/** 96 px por polegada (convenção de tela) → PDF em pontos (72/pol.) e PPTX em polegadas. */
const PX_PER_INCH = 96;

/**
 * Exportador sobre pdf-lib (PDF) e PptxGenJS (PPTX), ambos JavaScript puro:
 * cada página renderizada ocupa a página/slide inteiro, sem margens; o PPTX leva
 * as notas do apresentador. Metadados apontam a Coded by M como autora.
 */
export class PdfPptxExporter implements DocumentExporter {
  async toPdf(pages: readonly ExportPage[], meta: ExportMeta): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(meta.title);
    pdf.setAuthor(meta.author);
    pdf.setCreator("Coded Atlas");
    pdf.setProducer("Coded Atlas");
    if (meta.subject) pdf.setSubject(meta.subject);
    for (const page of pages) {
      const image = page.mimeType === "image/png" ? await pdf.embedPng(page.bytes) : await pdf.embedJpg(page.bytes);
      const w = (page.width / PX_PER_INCH) * 72;
      const h = (page.height / PX_PER_INCH) * 72;
      const pdfPage = pdf.addPage([w, h]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: w, height: h });
    }
    return pdf.save();
  }

  async toPptx(pages: readonly ExportPage[], meta: ExportMeta): Promise<Uint8Array> {
    const pptx = new PptxGenJS();
    const first = pages[0];
    const width = (first?.width ?? 1920) / PX_PER_INCH;
    const height = (first?.height ?? 1080) / PX_PER_INCH;
    pptx.defineLayout({ name: "ATLAS", width, height });
    pptx.layout = "ATLAS";
    pptx.author = meta.author;
    pptx.company = "Coded by M";
    pptx.title = meta.title;
    if (meta.subject) pptx.subject = meta.subject;
    for (const page of pages) {
      const slide = pptx.addSlide();
      slide.background = { color: "000000" };
      slide.addImage({ data: `data:${page.mimeType};base64,${Buffer.from(page.bytes).toString("base64")}`, x: 0, y: 0, w: width, h: height });
      if (page.notes?.trim()) slide.addNotes(page.notes);
    }
    const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return new Uint8Array(out);
  }
}
