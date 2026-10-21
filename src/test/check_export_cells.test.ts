import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import { exportOriginalExcelHighlighted } from "../lib/excelExport";

describe("Check Export Cells Formatting", () => {
  it("should preserve original cell values and apply date and euro format", async () => {
    const excelBuffer = fs.readFileSync("test_real_data/E-FATURA MARGARIDA F RIBEIRO.xls");
    const cleanArrayBuffer = excelBuffer.buffer.slice(
      excelBuffer.byteOffset,
      excelBuffer.byteOffset + excelBuffer.byteLength
    );
    const fakeFile = {
      name: "E-FATURA MARGARIDA F RIBEIRO.xls",
      arrayBuffer: async () => cleanArrayBuffer,
    } as any;

    const fakeSummary = {
      suppliers: [
        {
          supplierKey: "508225442",
          supplierName: "Nuno Castro",
          status: "reconciliado",
          allExcelInvoices: [
            { id: "e1", isReconciled: true, excelRowIndex: 0 },
            { id: "e2", isReconciled: true, excelRowIndex: 1 },
          ],
          allPdfInvoices: [],
          excelInvoicesCount: 2,
          pdfInvoicesCount: 2,
          dayDiscrepancies: [],
        },
      ],
      totalExcel: 0,
      totalPdf: 0,
      totalDifference: 0,
      reconciledSuppliersCount: 1,
      partialSuppliersCount: 0,
      notReconciledSuppliersCount: 0,
      orphanExcelCount: 0,
      orphanPdfCount: 0,
    } as any;

    const outPath = path.resolve(process.cwd(), "test_real_data/test_out_inspect.xlsx");
    await exportOriginalExcelHighlighted(fakeFile, fakeSummary, outPath);

    const wb = XLSX.readFile(outPath);
    const ws = wb.Sheets[wb.SheetNames[0]];

    console.log("\n=== test_out_inspect.xlsx Row 2 (r=1) ===");
    for (let c = 0; c <= 6; c++) {
      const addr = XLSX.utils.encode_cell({ r: 1, c });
      console.log(addr, ":", ws[addr]);
    }

    console.log("\n=== test_out_inspect.xlsx Row 3 (r=2) ===");
    for (let c = 0; c <= 6; c++) {
      const addr = XLSX.utils.encode_cell({ r: 2, c });
      console.log(addr, ":", ws[addr]);
    }

    // Verify cell A2 (Setor)
    expect(ws["A2"]?.v).toBe("Saúde");
    // Verify cell B2 (Emitente)
    expect(ws["B2"]?.v).toContain("Maria do Sameiro");
    // Verify cell E2 (Data Emissão) has date formatted display
    expect(ws["E2"]?.w).toBe("23/01/2026");
    // Verify cell F2 (Total) has currency formatted display
    expect(ws["F2"]?.w).toBe("10.47 €");
  });
});
