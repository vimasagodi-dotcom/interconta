import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  normalizeSupplierName,
  extractAndValidateNif,
  buildSupplierKey,
  reconcileSupplier,
  reconcileAll,
  type InvoiceItem,
} from "./reconciliation";

describe("reconciliation module", () => {
  describe("financial cents precision", () => {
    it("should safely convert between euros and cents without float drift", () => {
      expect(toCents(123.45)).toBe(12345);
      expect(toCents(0.01)).toBe(1);
      expect(toCents(0.07 + 0.01)).toBe(8); // clássico 0.07 + 0.01 = 0.08000000000000002
      expect(fromCents(12345)).toBe(123.45);
      expect(fromCents(8)).toBe(0.08);
    });
  });

  describe("supplier normalization & NIF extraction", () => {
    it("should normalize supplier names by stripping accents and company suffixes", () => {
      expect(normalizeSupplierName("Papelaria Central, Lda.")).toBe("PAPELARIA CENTRAL");
      expect(normalizeSupplierName("DISTRIBUIDORA NORTE - S.A.")).toBe("DISTRIBUIDORA NORTE");
      expect(normalizeSupplierName("Tecnologia & Inovação, Sociedade Unipessoal Lda")).toBe(
        "TECNOLOGIA INOVACAO"
      );
      expect(normalizeSupplierName("   Empresa   Exemplo,   SL   ")).toBe("EMPRESA EXEMPLO");
    });

    it("should validate Portuguese 9-digit NIFs", () => {
      expect(extractAndValidateNif("501234567")).toBe("501234567");
      expect(extractAndValidateNif("PT 501 234 567")).toBe("501234567");
      expect(extractAndValidateNif("123")).toBeUndefined();
    });

    it("should prioritize NIF over supplier name in key generation", () => {
      const keyWithNif = buildSupplierKey("Papelaria Alfa", "501234567");
      expect(keyWithNif).toBe("NIF:501234567");

      const keyWithoutNif = buildSupplierKey("Papelaria Alfa");
      expect(keyWithoutNif).toBe("NAME:PAPELARIA ALFA");
    });
  });

  describe("supplier reconciliation logic (reconcileSupplier)", () => {
    const makeInvoice = (
      id: string,
      docNum: string,
      date: string,
      amount: number,
      source: "excel" | "pdf",
      supplier = "Fornecedor Teste",
      nif = "501234567"
    ): InvoiceItem => ({
      id,
      supplierRaw: supplier,
      supplierNormalized: normalizeSupplierName(supplier),
      nif,
      documentNumber: docNum,
      date,
      amount,
      amountCents: toCents(amount),
      source,
    });

    // 1. Totais iguais -> RECONCILIADO
    it("case 1: should mark as 'reconciliado' when total amounts match exactly", () => {
      const excel = [
        makeInvoice("e1", "FT 101", "2024-03-01", 100.5, "excel"),
        makeInvoice("e2", "FT 102", "2024-03-10", 250.0, "excel"),
      ];
      const pdf = [
        makeInvoice("p1", "FT 101", "2024-03-01", 100.5, "pdf"),
        makeInvoice("p2", "FT 102", "2024-03-10", 250.0, "pdf"),
      ];

      const res = reconcileSupplier("NIF:501234567", "Fornecedor Teste", excel, pdf);
      expect(res.status).toBe("reconciliado");
      expect(res.difference).toBe(0);
      expect(res.totalExcel).toBe(350.5);
      expect(res.totalPdf).toBe(350.5);
      expect(res.dayDiscrepancies.length).toBe(0);
    });

    // 2. Tolerância de cêntimos (ex: 0,01 €)
    it("case 2: should reconcile when difference is within 0.01 € tolerance", () => {
      const excel = [makeInvoice("e1", "FT 101", "2024-03-01", 100.0, "excel")];
      const pdf = [makeInvoice("p1", "FT 101", "2024-03-01", 100.01, "pdf")];

      const res = reconcileSupplier("NIF:501234567", "Fornecedor Teste", excel, pdf);
      expect(res.status).toBe("reconciliado");
      expect(res.difference).toBe(0);
    });

    // 3. Várias faturas no mesmo dia que somam o mesmo valor
    it("case 3: should reconcile when multiple invoices on the same day sum to the same amount", () => {
      const excel = [
        makeInvoice("e1", "FT 1", "2024-03-15", 40.0, "excel"),
        makeInvoice("e2", "FT 2", "2024-03-15", 60.0, "excel"),
      ];
      const pdf = [makeInvoice("p1", "FT AGREGADA", "2024-03-15", 100.0, "pdf")];

      const res = reconcileSupplier("NIF:501234567", "Fornecedor Teste", excel, pdf);
      expect(res.status).toBe("reconciliado");
      expect(res.totalExcel).toBe(100.0);
      expect(res.totalPdf).toBe(100.0);
    });

    // 4. Totais diferentes com alguns dias iguais -> PARCIALMENTE RECONCILIADO
    it("case 4: should mark as 'parcialmente_reconciliado' when some days match but others differ", () => {
      const excel = [
        makeInvoice("e1", "FT 1", "2024-03-01", 100.0, "excel"), // Dia coincide
        makeInvoice("e2", "FT 2", "2024-03-15", 200.0, "excel"), // Dia difere
      ];
      const pdf = [
        makeInvoice("p1", "FT 1", "2024-03-01", 100.0, "pdf"), // 100.0
        makeInvoice("p2", "FT 2", "2024-03-15", 150.0, "pdf"), // 150.0 vs 200.0
      ];

      const res = reconcileSupplier("NIF:501234567", "Fornecedor Teste", excel, pdf);
      expect(res.status).toBe("parcialmente_reconciliado");
      expect(res.correctDaysCount).toBe(1);
      expect(res.discrepantDaysCount).toBe(1);
      expect(res.difference).toBe(50.0);
      expect(res.dayDiscrepancies.length).toBe(1);
      expect(res.dayDiscrepancies[0].date).toBe("2024-03-15");
      expect(res.dayDiscrepancies[0].difference).toBe(50.0);
    });

    // 5. Dia só num dos lados
    it("case 5: should flag days existing only on one side as discrepancies", () => {
      const excel = [
        makeInvoice("e1", "FT 1", "2024-03-01", 100.0, "excel"),
        makeInvoice("e2", "FT 2", "2024-03-20", 80.0, "excel"), // Só no Excel
      ];
      const pdf = [
        makeInvoice("p1", "FT 1", "2024-03-01", 100.0, "pdf"),
        makeInvoice("p2", "FT 3", "2024-03-25", 90.0, "pdf"), // Só no PDF
      ];

      const res = reconcileSupplier("NIF:501234567", "Fornecedor Teste", excel, pdf);
      expect(res.status).toBe("parcialmente_reconciliado");
      expect(res.correctDaysCount).toBe(1); // 2024-03-01
      expect(res.discrepantDaysCount).toBe(2); // 2024-03-20 e 2024-03-25

      const diffDates = res.dayDiscrepancies.map((d) => d.date);
      expect(diffDates).toContain("2024-03-20");
      expect(diffDates).toContain("2024-03-25");

      expect(res.orphanExcelInvoices.length).toBe(1);
      expect(res.orphanExcelInvoices[0].documentNumber).toBe("FT 2");

      expect(res.orphanPdfInvoices.length).toBe(1);
      expect(res.orphanPdfInvoices[0].documentNumber).toBe("FT 3");
    });

    // 6. Fornecedor só num dos ficheiros
    it("case 6: should mark as 'nao_reconciliado' when supplier exists only in Excel or only in PDF", () => {
      const excelOnly = [makeInvoice("e1", "FT 1", "2024-03-01", 500.0, "excel")];
      const resExcel = reconcileSupplier("NIF:501234567", "Fornecedor Só Excel", excelOnly, []);
      expect(resExcel.status).toBe("nao_reconciliado");
      expect(resExcel.difference).toBe(500.0);
      expect(resExcel.orphanExcelInvoices.length).toBe(1);

      const pdfOnly = [makeInvoice("p1", "FT 1", "2024-03-01", 300.0, "pdf")];
      const resPdf = reconcileSupplier("NIF:501999999", "Fornecedor Só PDF", [], pdfOnly);
      expect(resPdf.status).toBe("nao_reconciliado");
      expect(resPdf.difference).toBe(-300.0);
      expect(resPdf.orphanPdfInvoices.length).toBe(1);
    });
  });

  describe("global reconciliation (reconcileAll)", () => {
    it("should reconcile multiple suppliers and prioritize non-reconciled first", () => {
      const excelInvoices: InvoiceItem[] = [
        // Fornecedor A: 100% Reconciliado
        {
          id: "e1",
          supplierRaw: "Alfa Comércio Lda",
          supplierNormalized: "ALFA COMERCIO",
          nif: "501111111",
          documentNumber: "FT 1",
          date: "2024-02-01",
          amount: 200,
          amountCents: 20000,
          source: "excel",
        },
        // Fornecedor B: Não Reconciliado (só Excel)
        {
          id: "e2",
          supplierRaw: "Beta Serviços",
          supplierNormalized: "BETA SERVICOS",
          nif: "502222222",
          documentNumber: "FT 2",
          date: "2024-02-05",
          amount: 150,
          amountCents: 15000,
          source: "excel",
        },
      ];

      const pdfInvoices: InvoiceItem[] = [
        // Fornecedor A: valor idêntico
        {
          id: "p1",
          supplierRaw: "ALFA COMERCIO, S.A.",
          supplierNormalized: "ALFA COMERCIO",
          nif: "501111111",
          documentNumber: "FT 1",
          date: "2024-02-01",
          amount: 200,
          amountCents: 20000,
          source: "pdf",
        },
      ];

      const summary = reconcileAll(excelInvoices, pdfInvoices);
      expect(summary.totalSuppliers).toBe(2);
      expect(summary.reconciledCount).toBe(1);
      expect(summary.notReconciledCount).toBe(1);

      // Verificação de ordenação: não reconciliados devem surgir no topo
      expect(summary.suppliers[0].supplierName).toBe("Beta Serviços");
      expect(summary.suppliers[0].status).toBe("nao_reconciliado");
      expect(summary.suppliers[1].supplierName).toBe("Alfa Comércio Lda");
      expect(summary.suppliers[1].status).toBe("reconciliado");
    });

    it("should reconcile real e-Fatura format with embedded NIF and ATCUD suffix", async () => {
      const { extractInvoicesFromExcel } = await import("./excelParser");
      const excelRows = [
        {
          "Emitente": "117694363 - Maria do Sameiro Teixeira Maia Silverio",
          "Nº Fatura / ATCUD": "FR U003/147002 / JFK87J4D-147002",
          "Data Emissão": "1/23/26",
          "Total": "10.47 €",
        },
      ];

      const mapping = {
        supplierCol: "Emitente",
        docNumberCol: "Nº Fatura / ATCUD",
        dateCol: "Data Emissão",
        amountCol: "Total",
      };

      const parsedExcel = extractInvoicesFromExcel(excelRows, mapping);
      expect(parsedExcel.length).toBe(1);
      expect(parsedExcel[0].nif).toBe("117694363");
      expect(parsedExcel[0].supplierRaw).toBe("Maria do Sameiro Teixeira Maia Silverio");
      expect(parsedExcel[0].documentNumber).toBe("FR U003/147002");
      expect(parsedExcel[0].date).toBe("2026-01-23");
      expect(parsedExcel[0].amount).toBe(10.47);

      const pdfInvoices: InvoiceItem[] = [
        {
          id: "p1",
          supplierRaw: "Maria do Sameiro Teixeira Maia Silverio",
          supplierNormalized: "MARIA DO SAMEIRO TEIXEIRA MAIA SILVERIO",
          nif: "117694363",
          documentNumber: "FR U003/147002",
          date: "2026-01-23",
          amount: 10.47,
          amountCents: 1047,
          source: "pdf",
        },
      ];

      const summary = reconcileAll(parsedExcel, pdfInvoices);
      expect(summary.totalSuppliers).toBe(1);
      expect(summary.reconciledCount).toBe(1);
      expect(summary.suppliers[0].status).toBe("reconciliado");
    });
  });

  describe("accounting recapitulativos line extraction (parseRecapitulativoLine)", () => {
    it("should parse standard invoice line from accounting extract", async () => {
      const { parseRecapitulativoLine } = await import("./pdfExtractor");
      const line =
        "117694363 Maria do Sameiro Teixeira Maia Silverio FC 23-01-2026 5 111 501035 FR U003/147002 V/ Fatura 0,00 10,47 10,47";
      const parsed = parseRecapitulativoLine(line);
      expect(parsed).not.toBeNull();
      expect(parsed?.nif).toBe("117694363");
      expect(parsed?.supplierName).toBe("Maria do Sameiro Teixeira Maia Silverio");
      expect(parsed?.date).toBe("2026-01-23");
      expect(parsed?.docNumber).toBe("FR U003/147002");
      expect(parsed?.internalDocNumber).toBe("501035");
      expect(parsed?.amount).toBe(10.47);
    });

    it("should parse credit notes with negative amount from accounting extract", async () => {
      const { parseRecapitulativoLine } = await import("./pdfExtractor");
      const line =
        "507862775 Nobel Biocare Portugal S A FD 28-07-2026 2 22111028 207013 RE 04/5730020962 V/ Nota Credito 7 229,20 0,00 -7 229,20";
      const parsed = parseRecapitulativoLine(line);
      expect(parsed).not.toBeNull();
      expect(parsed?.nif).toBe("507862775");
      expect(parsed?.internalDocNumber).toBe("207013");
      expect(parsed?.amount).toBe(-7229.2);
    });

    it("should parse foreign European VAT suppliers", async () => {
      const { parseRecapitulativoLine } = await import("./pdfExtractor");
      const line = "esa08820953 DONTALIA FC 05-08-2026 2 122 208017 22235 V/ Fatura 0,00 257,99 257,99";
      const parsed = parseRecapitulativoLine(line);
      expect(parsed).not.toBeNull();
      expect(parsed?.nif).toBe("esa08820953");
      expect(parsed?.supplierName).toBe("DONTALIA");
      expect(parsed?.internalDocNumber).toBe("208017");
      expect(parsed?.amount).toBe(257.99);
    });
  });

  describe("credit notes and excel formatting", () => {
    it("should negate amount for credit notes in extractInvoicesFromExcel", async () => {
      const { extractInvoicesFromExcel } = await import("./excelParser");
      const rawRows = [
        {
          Emitente: "508225442 - Nuno Castro e Angelica Pinto Lda",
          "Nº Fatura / ATCUD": "NC 2026/00116 / ATCUD-001",
          Tipo: "Nota de crédito",
          "Data Emissão": "2026-05-07",
          Total: "354.04 €",
        },
        {
          Emitente: "508225442 - Nuno Castro e Angelica Pinto Lda",
          "Nº Fatura / ATCUD": "FA 2026/05442 / ATCUD-002",
          Tipo: "Fatura",
          "Data Emissão": "2026-05-07",
          Total: "18.02 €",
        },
      ];

      const mapping = {
        supplierCol: "Emitente",
        docNumberCol: "Nº Fatura / ATCUD",
        dateCol: "Data Emissão",
        amountCol: "Total",
      };

      const items = extractInvoicesFromExcel(rawRows, mapping);
      expect(items[0].documentNumber).toBe("NC 2026/00116");
      expect(items[0].amount).toBe(-354.04);
      expect(items[0].amountCents).toBe(-35404);

      expect(items[1].documentNumber).toBe("FA 2026/05442");
      expect(items[1].amount).toBe(18.02);
      expect(items[1].amountCents).toBe(1802);
    });

    it("should correctly convert ISO dates to Excel serial numbers", async () => {
      const { dateToExcelSerial } = await import("./excelExport");
      expect(dateToExcelSerial("2026-01-23")).toBe(46045);
      expect(dateToExcelSerial("2026-04-10")).toBe(46122);
      expect(dateToExcelSerial("")).toBeNull();
    });
  });

  describe("e-Fatura green highlighting export", () => {
    it("should mark reconciled invoices and preserve excelRowIndex", async () => {
      const { extractInvoicesFromExcel } = await import("./excelParser");
      const rawRows = [
        {
          Emitente: "500123456 - Fornecedor Alpha Lda",
          "Nº Fatura": "FT 001",
          Data: "2026-01-15",
          Valor: "100.00",
        },
        {
          Emitente: "500123456 - Fornecedor Alpha Lda",
          "Nº Fatura": "FT 002",
          Data: "2026-01-20",
          Valor: "50.00",
        },
      ];

      const mapping = {
        supplierCol: "Emitente",
        docNumberCol: "Nº Fatura",
        dateCol: "Data",
        amountCol: "Valor",
      };

      const excelInvs = extractInvoicesFromExcel(rawRows, mapping);
      expect(excelInvs[0].excelRowIndex).toBe(0);
      expect(excelInvs[1].excelRowIndex).toBe(1);

      // PDF tem apenas FT 001
      const pdfInvs: InvoiceItem[] = [
        {
          id: "p1",
          supplierRaw: "Fornecedor Alpha Lda",
          supplierNormalized: "FORNECEDOR ALPHA",
          nif: "500123456",
          documentNumber: "FT 001",
          date: "2026-01-15",
          amount: 100.0,
          amountCents: 10000,
          source: "pdf",
        },
      ];

      const summary = reconcileAll(excelInvs, pdfInvs);
      const alpha = summary.suppliers.find((s) => s.nif === "500123456");
      expect(alpha).toBeDefined();

      const inv0 = alpha?.allExcelInvoices.find((i) => i.excelRowIndex === 0);
      const inv1 = alpha?.allExcelInvoices.find((i) => i.excelRowIndex === 1);
      expect(inv0?.isReconciled).toBe(true);
      expect(inv1?.isReconciled).toBe(false);
    });

    it("should match documents by suffix/last digits and clean accounting labels (docNumbersMatch)", async () => {
      const { docNumbersMatch } = await import("./reconciliation");

      // Medseghi case: FT D2-A/14388 ends with 4388
      expect(docNumbersMatch("FT D2-A/14388 / JFXP9F1D-14388", "4388 V/ Factura")).toBe(true);
      expect(docNumbersMatch("FT D2-A/14388", "4388")).toBe(true);

      // Maria Jose case: FRB FRB2026/667 ends with 667
      expect(docNumbersMatch("FRB FRB2026/667 / J6Z18YSD-667", "667 V/ Factura")).toBe(true);
      expect(docNumbersMatch("FRB FRB2026/667", "667")).toBe(true);

      // Leading zeros / integer match
      expect(docNumbersMatch("NC 2026/00116", "116 V/ Nota Credito")).toBe(true);
      expect(docNumbersMatch("FA 2026/054", "54")).toBe(true);

      // Exact matches
      expect(docNumbersMatch("1", "1")).toBe(true);
      expect(docNumbersMatch("82162", "82162")).toBe(true);

      // Non-matches
      expect(docNumbersMatch("1", "2")).toBe(false);
      expect(docNumbersMatch("14388", "99999")).toBe(false);
      expect(docNumbersMatch("FT D2-A/14388", "507024")).toBe(false);
    });

    it("should detect same month or near dates (isSameMonthOrNear)", async () => {
      const { isSameMonthOrNear } = await import("./reconciliation");

      expect(isSameMonthOrNear("2026-08-11", "2026-08-12")).toBe(true);
      expect(isSameMonthOrNear("2026-07-31", "2026-07-31")).toBe(true);
      expect(isSameMonthOrNear("2026-07-31", "2026-08-04")).toBe(true);
      expect(isSameMonthOrNear("2026-01-10", "2026-08-11")).toBe(false);
    });

    it("should reconcile Maria Jose across different dates in same month with matching doc suffix (11-08 vs 12-08)", async () => {
      const { reconcileAll } = await import("./reconciliation");

      const excelInvs = [
        {
          id: "e_maria_1",
          supplierRaw: "Maria Jose Soares Fernandes",
          supplierNormalized: "MARIA JOSE SOARES FERNANDES",
          nif: "203997263",
          documentNumber: "FRB FRB2026/667 / J6Z18YSD-667",
          date: "2026-08-11",
          amount: 3.0,
          amountCents: 300,
          source: "excel" as const,
          excelRowIndex: 2,
        },
      ];

      const pdfInvs = [
        {
          id: "p_maria_1",
          supplierRaw: "Maria Jose Soares Fernandes",
          supplierNormalized: "MARIA JOSE SOARES FERNANDES",
          nif: "203997263",
          documentNumber: "667 V/ Factura",
          internalDocNumber: "508010",
          date: "2026-08-12",
          amount: 3.0,
          amountCents: 300,
          source: "pdf" as const,
        },
      ];

      const summary = reconcileAll(excelInvs, pdfInvs);
      const supplier = summary.suppliers.find((s) => s.nif === "203997263");

      expect(supplier).toBeDefined();
      expect(supplier?.status).toBe("reconciliado");
      expect(excelInvs[0].isReconciled).toBe(true);
      expect(pdfInvs[0].isReconciled).toBe(true);
    });

    it("should reconcile Medseghi when accounting books Base Tributável and doc numbers match by suffix", async () => {
      const { reconcileAll } = await import("./reconciliation");

      const excelInvs = [
        {
          id: "e_med_1",
          supplierRaw: "Medseghi - Medicina Seguranca e Higiene",
          supplierNormalized: "MEDSEGHI",
          nif: "513295445",
          documentNumber: "FT D2-A/14388 / JFXP9F1D-14388",
          date: "2026-07-31",
          amount: 553.5,
          amountCents: 55350,
          baseAmount: 450.0,
          baseAmountCents: 45000,
          source: "excel" as const,
          excelRowIndex: 0,
        },
        {
          id: "e_med_2",
          supplierRaw: "Medseghi - Medicina Seguranca e Higiene",
          supplierNormalized: "MEDSEGHI",
          nif: "513295445",
          documentNumber: "FT D2-A/14393 / JFXP9F1D-14393",
          date: "2026-07-31",
          amount: 280.0,
          amountCents: 28000,
          baseAmount: 280.0,
          baseAmountCents: 28000,
          source: "excel" as const,
          excelRowIndex: 1,
        },
      ];

      const pdfInvs = [
        {
          id: "p_med_1",
          supplierRaw: "Medseghi - Medicina Seguranca e Higiene N",
          supplierNormalized: "MEDSEGHI",
          nif: "513295445",
          documentNumber: "4388 V/ Factura",
          internalDocNumber: "507024",
          date: "2026-07-31",
          amount: 450.0,
          amountCents: 45000,
          source: "pdf" as const,
        },
        {
          id: "p_med_2",
          supplierRaw: "Medseghi - Medicina Seguranca e Higiene N",
          supplierNormalized: "MEDSEGHI",
          nif: "513295445",
          documentNumber: "4393 V/ Factura",
          internalDocNumber: "507025",
          date: "2026-07-31",
          amount: 280.0,
          amountCents: 28000,
          source: "pdf" as const,
        },
      ];

      const summary = reconcileAll(excelInvs, pdfInvs);
      const supplier = summary.suppliers.find((s) => s.nif === "513295445");

      expect(supplier).toBeDefined();
      expect(supplier?.status).toBe("reconciliado");
      expect(excelInvs[0].isReconciled).toBe(true);
      expect(excelInvs[1].isReconciled).toBe(true);
      expect(pdfInvs[0].isReconciled).toBe(true);
      expect(pdfInvs[1].isReconciled).toBe(true);
    });
  });
});
