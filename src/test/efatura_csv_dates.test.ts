import { describe, it, expect } from "vitest";
import { parseExcelPreview, extractInvoicesFromExcel, parsePortugueseDate } from "../lib/excelParser";

describe("e-Fatura CSV Portuguese Date Integrity", () => {
  it("should parse Portuguese dates correctly with DD-MM-YYYY format", () => {
    expect(parsePortugueseDate("04-09-2026")).toBe("2026-09-04");
    expect(parsePortugueseDate("02-09-2026")).toBe("2026-09-02");
    expect(parsePortugueseDate("07-09-2026")).toBe("2026-09-07");
    expect(parsePortugueseDate("11-09-2026")).toBe("2026-09-11");
    expect(parsePortugueseDate("14-09-2026")).toBe("2026-09-14");
    expect(parsePortugueseDate("04/09/2026")).toBe("2026-09-04");
  });

  it("should preserve original date when importing e-fatura.csv", async () => {
    const csvContent = [
      "Setor;Emitente;Nº Fatura / ATCUD;Tipo;Data Emissão;Total;IVA;Base Tributável;Situação;Comunicação  Emitente;Comunicação  Adquirente",
      "Outros;500676372 - Sociedade Comercial C. Santos, S.A.;FT YFFV/33009273 / JFKKDZMS-33009273;Fatura;04-09-2026;5.501,83 €;1.028,80 €;4.473,03 €;Registado;X;",
      "Manutenção;324324499 - Wesley Matheus;FR ATSIRE01FR/15;Fatura-recibo;02-09-2026;1.930,74 €;361,03 €;1.569,71 €;Registado;X;",
      "Outros;509816525 - Enforcesco;10FT EI26/32648;Fatura;14-09-2026;705,50 €;131,53 €;573,97 €;Registado;X;",
    ].join("\n");

    const buf = Buffer.from(csvContent, "utf-8");
    const fakeFile = {
      name: "e-fatura.csv",
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };

    const preview = await parseExcelPreview(fakeFile as any);
    const dateCol = preview.detectedMapping.dateCol;
    expect(preview.rawRows[0][dateCol]).toBe("04-09-2026");
    expect(preview.rawRows[1][dateCol]).toBe("02-09-2026");
    expect(preview.rawRows[2][dateCol]).toBe("14-09-2026");

    const invoices = extractInvoicesFromExcel(preview.rawRows, preview.detectedMapping);
    expect(invoices[0].date).toBe("2026-09-04");
    expect(invoices[1].date).toBe("2026-09-02");
    expect(invoices[2].date).toBe("2026-09-14");
  });
});
