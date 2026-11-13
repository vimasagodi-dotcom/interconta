import { describe, it, expect } from "vitest";
import {
  areInvoiceNumbersSimilar,
  detectEqualValueGroups,
  InvoiceItem,
  toCents,
} from "../lib/reconciliation";

describe("Deteção de Faturas com Valores Iguais / Suspeita de Duplicados", () => {
  it("deve detetar números de fatura similares na mesma data", () => {
    expect(areInvoiceNumbersSimilar("FT 2024/101", "FT 2024/101")).toBe(true);
    expect(areInvoiceNumbersSimilar("FT 2024/101", "FT 2024/102")).toBe(true); // consecutivo
    expect(areInvoiceNumbersSimilar("FT 100", "FT 100/1")).toBe(true); // sufixo
    expect(areInvoiceNumbersSimilar("FT 100", "FT 100-A")).toBe(true); // variante
    expect(areInvoiceNumbersSimilar("FT 01/5432", "5432")).toBe(true); // dígitos idênticos
    expect(areInvoiceNumbersSimilar("FT 2026/101", "FT 2026/890")).toBe(false); // números distintos
  });

  it("não deve sinalizar faturas mensais legítimas em datas distintas como duplicadas", () => {
    // 3 faturas de avença mensal em datas distintas (Julho, Agosto, Setembro)
    const efInvoices: InvoiceItem[] = [
      {
        id: "1",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/824",
        date: "2026-07-30",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
      {
        id: "2",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/854",
        date: "2026-08-06",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
      {
        id: "3",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/979",
        date: "2026-09-14",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
    ];

    const mdiInvoices: InvoiceItem[] = [
      {
        id: "m1",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/824",
        date: "2026-07-30",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
      {
        id: "m2",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/854",
        date: "2026-08-06",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
      {
        id: "m3",
        supplierRaw: "We Digital Lda",
        supplierNormalized: "WE DIGITAL",
        nif: "515816787",
        documentNumber: "FAT 89126/979",
        date: "2026-09-14",
        amount: 302.58,
        amountCents: toCents(302.58),
        isReconciled: true,
      },
    ];

    const groups = detectEqualValueGroups("We Digital Lda", "515816787", efInvoices, mdiInvoices);
    expect(groups.length).toBe(0);
    expect(efInvoices.every((i) => !i.needsVerification)).toBe(true);
  });

  it("deve sinalizar faturas com o mesmo valor lançadas duas vezes no MDI quando no e-Fatura só existe uma", () => {
    // 2 faturas lançadas no MDI no mesmo dia com números parecidos/idênticos, mas apenas 1 no e-Fatura
    const efInvoices: InvoiceItem[] = [
      {
        id: "1",
        supplierRaw: "Fornecedor Teste",
        supplierNormalized: "FORNECEDOR TESTE",
        nif: "501234567",
        documentNumber: "FT 2026/101",
        date: "2026-08-10",
        amount: 150.0,
        amountCents: toCents(150.0),
      },
    ];

    const mdiInvoices: InvoiceItem[] = [
      {
        id: "m1",
        supplierRaw: "Fornecedor Teste",
        supplierNormalized: "FORNECEDOR TESTE",
        nif: "501234567",
        documentNumber: "101",
        date: "2026-08-10",
        amount: 150.0,
        amountCents: toCents(150.0),
      },
      {
        id: "m2",
        supplierRaw: "Fornecedor Teste",
        supplierNormalized: "FORNECEDOR TESTE",
        nif: "501234567",
        documentNumber: "101", // Lançada duas vezes por engano na contabilidade
        date: "2026-08-10",
        amount: 150.0,
        amountCents: toCents(150.0),
      },
    ];

    const groups = detectEqualValueGroups("Fornecedor Teste", "501234567", efInvoices, mdiInvoices);
    expect(groups.length).toBe(1);
    expect(groups[0].status).toBe("a_verificar");
    expect(mdiInvoices[0].needsVerification).toBe(true);
    expect(mdiInvoices[1].needsVerification).toBe(true);
  });

  it("não deve sinalizar faturas como duplicadas se existirem no e-Fatura em número correspondente (caso Area, S.A.)", () => {
    // 2 faturas no MDI e 2 faturas no e-Fatura na mesma data com o mesmo valor
    const efInvoices: InvoiceItem[] = [
      {
        id: "ef1",
        supplierRaw: "Area, S.A.",
        supplierNormalized: "AREA",
        nif: "502580097",
        documentNumber: "FS 14C/100148162",
        date: "2026-09-19",
        amount: 204.4,
        amountCents: toCents(204.4),
      },
      {
        id: "ef2",
        supplierRaw: "Area, S.A.",
        supplierNormalized: "AREA",
        nif: "502580097",
        documentNumber: "FT 14A/100021464",
        date: "2026-09-19",
        amount: 204.4,
        amountCents: toCents(204.4),
      },
    ];

    const mdiInvoices: InvoiceItem[] = [
      {
        id: "m1",
        supplierRaw: "Area, S.A.",
        supplierNormalized: "AREA",
        nif: "502580097",
        documentNumber: "18162",
        date: "2026-09-19",
        amount: 204.4,
        amountCents: toCents(204.4),
      },
      {
        id: "m2",
        supplierRaw: "Area, S.A.",
        supplierNormalized: "AREA",
        nif: "502580097",
        documentNumber: "1464",
        date: "2026-09-19",
        amount: 204.4,
        amountCents: toCents(204.4),
      },
    ];

    const groups = detectEqualValueGroups("Area, S.A.", "502580097", efInvoices, mdiInvoices);
    // Se ambas existem no e-Fatura, NÃO é duplicado!
    expect(groups.length).toBe(0);
    expect(mdiInvoices.every((i) => !i.needsVerification)).toBe(true);
    expect(efInvoices.every((i) => !i.needsVerification)).toBe(true);
  });

  it("não deve sinalizar faturas como duplicadas na contabilidade se tiverem 0 lançamentos no MDI (caso Banco BPI)", () => {
    // 2 faturas no e-Fatura e 0 no MDI
    const efInvoices: InvoiceItem[] = [
      {
        id: "ef1",
        supplierRaw: "Banco Bpi Sa",
        supplierNormalized: "BANCO BPI",
        nif: "501214534",
        documentNumber: "FT 004/81553721",
        date: "2026-07-07",
        amount: 24.37,
        amountCents: toCents(24.37),
      },
      {
        id: "ef2",
        supplierRaw: "Banco Bpi Sa",
        supplierNormalized: "BANCO BPI",
        nif: "501214534",
        documentNumber: "FT 004/81553720",
        date: "2026-07-07",
        amount: 24.37,
        amountCents: toCents(24.37),
      },
    ];

    const mdiInvoices: InvoiceItem[] = [];

    const groups = detectEqualValueGroups("Banco Bpi Sa", "501214534", efInvoices, mdiInvoices);
    expect(groups.length).toBe(0);
  });
});

