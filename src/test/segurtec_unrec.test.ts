import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { reconcileAll } from "../lib/reconciliation";
import { extractInvoicesFromExcel } from "../lib/excelParser";
import { parseRecapitulativoLine, reconstructLinesFromPdfItems } from "../lib/pdfExtractor";

describe("Segurtec Unreconciled Invoice Verification", () => {
  it("should detect the 271.06 EUR Segurtec invoice as unreconciled", async () => {
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
    const segurtec = summary.suppliers.find(
      (s) => (s.nif && s.nif.includes("505891735")) || s.supplierName.toLowerCase().includes("segurtec")
    );

    expect(segurtec).toBeDefined();
    console.log("Segurtec status:", segurtec?.status);
    console.log("Segurtec difference:", segurtec?.difference);

    const invoice271 = segurtec?.allPdfInvoices.find((inv) => Math.abs(inv.amount - 271.06) < 0.01);
    console.log("Invoice 271.06 found in PDF:", !!invoice271);
    console.log("Invoice 271.06 isReconciled:", invoice271?.isReconciled);

    expect(invoice271).toBeDefined();
    expect(invoice271?.isReconciled).toBe(false);

    // Contar todas as faturas PDF não reconciliadas
    const allUnreconciledPdf = summary.suppliers.flatMap((s) =>
      s.allPdfInvoices.filter((inv) => !inv.isReconciled)
    );
    console.log("Total PDF invoices NOT in e-Fatura:", allUnreconciledPdf.length);
    expect(allUnreconciledPdf.length).toBeGreaterThan(0);
  });
});
