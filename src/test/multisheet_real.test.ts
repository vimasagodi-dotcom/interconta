import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { reconcileAll } from "../lib/reconciliation";
import { extractInvoicesFromExcel } from "../lib/excelParser";
import { parseRecapitulativoLine, reconstructLinesFromPdfItems } from "../lib/pdfExtractor";
import { exportOriginalExcelHighlighted } from "../lib/excelExport";

describe("Multisheet Export Real Data Verification", () => {
  it("should generate Folha 1 (e-Fatura verde) and Folha 2 (Não no e-Fatura) with Segurtec 271.06 EUR", async () => {
    const excelPath = path.resolve(process.cwd(), "test_real_data/E-FATURA MARGARIDA F RIBEIRO.xls");
    const excelBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(excelBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

    const mapping = {
      supplierCol: "Emitente",
      docNumberCol: "Nº Fatura / ATCUD",
      dateCol: "Data Emissão",
      amountCol: "Total",
    };

    const excelInvoices = extractInvoicesFromExcel(rawRows as any, mapping);

    const pdfPath = path.resolve(process.cwd(), "test_real_data/E-FATURA MARGARIDA F RIBEIRO.pdf");
    const pdfBuffer = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDoc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

    const pdfInvoices: any[] = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const visualLines = reconstructLinesFromPdfItems(content.items);
      for (const line of visualLines) {
        const parsed = parseRecapitulativoLine(line);
        if (parsed) {
          pdfInvoices.push({
            id: `pdf_${p}_${pdfInvoices.length + 1}`,
            supplierRaw: parsed.supplierName,
            supplierNormalized: parsed.supplierName.toUpperCase(),
            nif: parsed.nif,
            documentNumber: parsed.docNumber,
            internalDocNumber: parsed.internalDocNumber,
            date: parsed.date,
            amount: parsed.amount,
            amountCents: Math.round(parsed.amount * 100),
            source: "pdf",
            pdfFileName: "E-FATURA MARGARIDA F RIBEIRO.pdf",
            pageNumber: p,
          });
        }
      }
    }

    const summary = reconcileAll(excelInvoices, pdfInvoices);

    const fakeFile = {
      name: "E-FATURA MARGARIDA F RIBEIRO.xls",
      arrayBuffer: async () =>
        excelBuffer.buffer.slice(
          excelBuffer.byteOffset,
          excelBuffer.byteOffset + excelBuffer.byteLength
        ),
    } as any;

    const outPath = path.resolve(process.cwd(), "test_real_data/E-FATURA_RECONCILIADO_COM_FOLHA2.xlsx");
    const result = await exportOriginalExcelHighlighted(fakeFile, summary, outPath);

    expect(result.reconciledCount).toBeGreaterThan(0);
    expect(result.unreconciledPdfCount).toBeGreaterThan(0);

    const wbRead = XLSX.readFile(outPath, { cellStyles: true });
    expect(wbRead.SheetNames).toContain("Não no e-Fatura (Contab)");

    const ws2 = wbRead.Sheets["Não no e-Fatura (Contab)"];
    const rowsSheet2: any[] = XLSX.utils.sheet_to_json(ws2, { defval: "", raw: false });

    // Verificar se Segurtec 271.06 está na Folha 2
    const segurtec = rowsSheet2.find(
      (r) =>
        (r["NIF"] === "505891735" || r["Fornecedor"].includes("Segurtec")) &&
        (String(r["Valor Lançado (€)"]).includes("271") || r["Valor Lançado (€)"] === 271.06)
    );

    expect(segurtec).toBeDefined();
    expect(segurtec["Estado"]).toBe("Não Reconciliado");
  });
});
