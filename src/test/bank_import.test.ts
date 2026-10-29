import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import {
  parseBankRows,
  buildImportLines,
  toMicrodigitalRows,
  buildMicrodigitalWorkbook,
  MICRODIGITAL_HEADERS,
  MICRODIGITAL_SHEET_NAME,
  parseBankAmount,
  parseBankDate,
} from "../lib/bankImport";

const dir = path.resolve(process.cwd(), "test_real_data");
const src = path.join(dir, "anexo 1.xlsx");
const ref = path.join(dir, "anexo 2.xls");
const hasFiles = fs.existsSync(src) && fs.existsSync(ref);

describe("bankImport helpers", () => {
  it("parses amounts and dates", () => {
    expect(parseBankAmount("30 152,22 €")).toBe(30152.22);
    expect(parseBankAmount("-   €")).toBe(0);
    expect(parseBankAmount(1234.5)).toBe(1234.5);
    expect(parseBankDate("06/01/2026")).toEqual({ year: 2026, month: 1, day: 6 });
    expect(parseBankDate("cabeçalho")).toBeNull();
  });

  it("numbers per month, restarts each month and balances each movement", () => {
    const rows = [
      ["Data", "Descrição"],
      ["16/01/2026", "B", 10, 0, 0, 1211, 2111180],
      ["06/01/2026", "A", 0, 5, 0, 1211, 2111180], // valor a crédito → vai para débito
      ["03/02/2026", "C", 7.5, 0, 0, 1211, 2111180],
    ];
    const { movements, issues } = parseBankRows(rows);
    expect(issues).toHaveLength(0);
    const lines = buildImportLines(movements, { diario: 9, descritivo: 18 });
    expect(lines.map((l) => l.numero)).toEqual([901001, 901001, 901002, 901002, 902001, 902001]);
    expect(lines[0]).toMatchObject({ conta: 1211, debito: 5, credito: 0, description: "A" });
    expect(lines[1]).toMatchObject({ conta: 2111180, debito: 0, credito: 5 });
  });

  it("reads 6-column layout exactly as in user attachment (Data, Descrição, Débito, Crédito, Conta Débito, Conta Crédito)", () => {
    const rows = [
      ["08-04-2026", "MANUTENCAO DE CONTA VALOR NEGOCIOS MAR 2026", "-7,99 €", "-   €", 698812, 1211],
      ["08-04-2026", "IMPOSTO DE SELO MAR 2026", "-0,32 €", "-   €", 681231701, 1211],
      ["08-05-2026", "MANUTENCAO DE CONTA VALOR NEGOCIOS ABR 2026", "-7,99 €", "-   €", 698812, 1211],
      ["08-05-2026", "IMPOSTO DE SELO ABR 2026", "-0,32 €", "-   €", 681231701, 1211],
      ["09-06-2026", "MANUTENCAO DE CONTA VALOR NEGOCIOS MAI 2026", "-7,99 €", "-   €", 698812, 1211],
      ["09-06-2026", "IMPOSTO DE SELO MAI 2026", "-0,32 €", "-   €", 681231701, 1211],
    ];

    const { movements, issues } = parseBankRows(rows);
    expect(issues).toHaveLength(0);
    expect(movements).toHaveLength(6);

    expect(movements[0]).toMatchObject({
      day: 8,
      month: 4,
      year: 2026,
      description: "MANUTENCAO DE CONTA VALOR NEGOCIOS MAR 2026",
      amount: 7.99,
      contaDebito: 698812,
      contaCredito: 1211,
    });

    expect(movements[1]).toMatchObject({
      day: 8,
      month: 4,
      year: 2026,
      description: "IMPOSTO DE SELO MAR 2026",
      amount: 0.32,
      contaDebito: 681231701,
      contaCredito: 1211,
    });

    const lines = buildImportLines(movements, { diario: 9, descritivo: 18 });
    expect(lines).toHaveLength(12);

    // Mês 4: 904001, 904002
    expect(lines[0]).toMatchObject({ numero: 904001, conta: 698812, debito: 7.99, credito: 0 });
    expect(lines[1]).toMatchObject({ numero: 904001, conta: 1211, debito: 0, credito: 7.99 });
    expect(lines[2]).toMatchObject({ numero: 904002, conta: 681231701, debito: 0.32, credito: 0 });
    expect(lines[3]).toMatchObject({ numero: 904002, conta: 1211, debito: 0, credito: 0.32 });

    // Mês 5: 905001, 905002
    expect(lines[4]).toMatchObject({ numero: 905001, conta: 698812, debito: 7.99, credito: 0 });
    expect(lines[5]).toMatchObject({ numero: 905001, conta: 1211, debito: 0, credito: 7.99 });

    // Total de débito e crédito balanceados
    const totalDeb = lines.reduce((s, l) => s + l.debito, 0);
    const totalCred = lines.reduce((s, l) => s + l.credito, 0);
    expect(Math.abs(totalDeb - totalCred)).toBeLessThan(0.001);
    expect(totalDeb).toBeCloseTo(24.93, 2);
  });
});

describe.skipIf(!hasFiles)("bankImport vs ficheiro real Microdigital", () => {
  it("gera exatamente as mesmas linhas que o ficheiro de importação de referência", () => {
    const wbSrc = XLSX.readFile(src);
    const rows = XLSX.utils.sheet_to_json(wbSrc.Sheets[wbSrc.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
    const { movements, issues } = parseBankRows(rows);
    expect(issues).toHaveLength(0);
    const config = { diario: 9, descritivo: 18 };
    const generated = toMicrodigitalRows(buildImportLines(movements, config), config);

    const wbRef = XLSX.readFile(ref);
    const refRows = XLSX.utils.sheet_to_json(wbRef.Sheets[MICRODIGITAL_SHEET_NAME], { header: 1, raw: true, defval: "" }) as unknown[][];
    expect(MICRODIGITAL_HEADERS[0]).toBe("'CDIARIO");
    expect(MICRODIGITAL_HEADERS.map((h) => h.replace(/^'/, ""))).toEqual(refRows[0]);
    const expected = refRows.slice(1);
    expect(generated.length).toBe(expected.length);

    generated.forEach((row, i) => {
      const exp = [...expected[i]];
      // O ficheiro de referência (manual) numerou o movimento de 07/10 como 909002 por engano;
      // o correto, com a regra Diário+Mês+Sequência, é 910001.
      if (exp[2] === 10 && exp[4] === 909002) {
        exp[4] = 910001;
        exp[5] = 910001;
      }
      // Normalizar espaços no descritivo (o anexo 2 manual tinha um espaço no fim numa linha)
      exp[10] = typeof exp[10] === "string" ? exp[10].trim() : exp[10];
      const normalizedRow = [...row];
      normalizedRow[10] = typeof normalizedRow[10] === "string" ? normalizedRow[10].trim() : normalizedRow[10];
      expect(normalizedRow).toEqual(exp);
    });

    // O ficheiro gerado em .xls tem APENAS a folha que tem valores (sem Activex nem mais nenhuma folha)
    const out = XLSX.write(buildMicrodigitalWorkbook(buildImportLines(movements, config), config), { bookType: "xls", type: "buffer" });
    const back = XLSX.read(out, { type: "buffer" });
    expect(back.SheetNames).toEqual([MICRODIGITAL_SHEET_NAME]);
    const backRows = XLSX.utils.sheet_to_json(back.Sheets[MICRODIGITAL_SHEET_NAME], { header: 1, raw: true, defval: "" }) as unknown[][];
    expect(backRows[0][0]).toBe("'CDIARIO");
    expect(backRows[1]).toEqual([9, 6, 1, 2026, 901001, 901001, 1211, 30152.22, 0, 18, "TRANSF SEPA -RESIWAY - SOLUCOE", "", "", "", "", "", 0, 6, 1, 2026]);
  });
});
