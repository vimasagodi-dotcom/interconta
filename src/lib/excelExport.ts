import XLSX from "xlsx-js-style";
import { GlobalReconciliationSummary, InvoiceItem } from "./reconciliation";
import { parsePortugueseAmount, parsePortugueseDate } from "./excelParser";

/**
 * Converte data ISO YYYY-MM-DD para número de série do Excel
 */
export function dateToExcelSerial(dateStr: string): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

/**
 * Exporta o ficheiro Excel ORIGINAL (ex: exportado do e-Fatura da AT)
 * preservando exatamente todas as colunas, cabeçalhos e valores originais,
 * - Folha 1: Ficheiro original com todas as linhas reconciliadas PINTADAS A VERDE (#C6EFCE)
 *            com datas formatadas como DD/MM/AAAA e valores em Euros (€)
 * - Folha 2: "Não no e-Fatura (Contab)" com todas as faturas que foram lançadas na
 *            contabilidade (PDF) mas NÃO existem no e-Fatura, incluindo o Nº Interno,
 *            datas formatadas e valores em Euros (€).
 */
export async function exportOriginalExcelHighlighted(
  originalFile: File,
  summary: GlobalReconciliationSummary,
  outputFileName?: string
): Promise<{
  reconciledCount: number;
  totalCount: number;
  unreconciledPdfCount: number;
  unreconciledPdfAmount: number;
}> {
  const rawBuffer = await originalFile.arrayBuffer();
  const buffer = new Uint8Array(rawBuffer);
  const wb = XLSX.read(buffer, { type: "array" });

  if (!wb.SheetNames.length) {
    throw new Error("O ficheiro original não contém folhas de cálculo.");
  }

  // =========================================================================
  // FOLHA 1: e-Fatura Original com Linhas Reconciliadas Pintadas a Verde
  // =========================================================================
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");

  // Identificar todas as linhas originais do Excel que foram reconciliadas
  const reconciledRowIndices = new Set<number>();
  let totalExcelInvoices = 0;

  for (const s of summary.suppliers) {
    for (const inv of s.allExcelInvoices) {
      totalExcelInvoices++;
      if (inv.isReconciled && typeof inv.excelRowIndex === "number") {
        reconciledRowIndices.add(inv.excelRowIndex);
      }
    }
  }

  // Estilo verde oficial do Excel para itens reconciliados
  const greenStyle = {
    fill: {
      patternType: "solid",
      fgColor: { rgb: "C6EFCE" }, // Fundo verde suave (Excel default)
    },
    font: {
      color: { rgb: "006100" }, // Texto verde escuro de alto contraste
    },
  };

  const headerRow = range.s.r;
  const firstDataRow = headerRow + 1;
  const totalRowsInSheet = range.e.r - firstDataRow + 1;

  // Deteção de colunas de Data e de Valores Monetários na Folha 1
  const dateColIndices = new Set<number>();
  const currencyColIndices = new Set<number>();

  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerAddr = XLSX.utils.encode_cell({ r: headerRow, c });
    const headerVal = String(ws[headerAddr]?.v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (headerVal.includes("data") || headerVal.includes("emissao") || headerVal.includes("date")) {
      dateColIndices.add(c);
    }
    if (
      headerVal.includes("total") ||
      headerVal.includes("iva") ||
      headerVal.includes("base") ||
      headerVal.includes("valor") ||
      headerVal.includes("montante") ||
      headerVal.includes("liquido") ||
      headerVal.includes("incidencia")
    ) {
      currencyColIndices.add(c);
    }
  }

  // Formatar todas as linhas de dados da Folha 1: datas como 'dd/mm/yyyy' e valores com '€'
  for (let r = firstDataRow; r <= range.e.r; r++) {
    // Formatar datas
    for (const c of dateColIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell) {
        if (typeof cell.v === "number") {
          cell.z = "dd/mm/yyyy";
        } else if (typeof cell.v === "string" && cell.v.trim()) {
          const iso = parsePortugueseDate(cell.v);
          const serial = dateToExcelSerial(iso);
          if (serial) {
            cell.t = "n";
            cell.v = serial;
            cell.z = "dd/mm/yyyy";
          }
        }
      }
    }

    // Formatar valores monetários em Euros (€)
    for (const c of currencyColIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell) {
        if (typeof cell.v === "number") {
          cell.z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
        } else if (typeof cell.v === "string" && cell.v.trim()) {
          const val = parsePortugueseAmount(cell.v);
          cell.t = "n";
          cell.v = val;
          cell.z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
        }
      }
    }
  }

  // Pintar linhas reconciliadas a verde
  for (let idx = 0; idx < totalRowsInSheet; idx++) {
    if (reconciledRowIndices.has(idx)) {
      const sheetRow = firstDataRow + idx;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: sheetRow, c });
        if (!ws[addr]) {
          ws[addr] = { t: "s", v: "" };
        }
        ws[addr].s = greenStyle;
      }
    }
  }

  // =========================================================================
  // FOLHA 2: Faturas Lançadas na Contabilidade mas NÃO Presentes no e-Fatura
  // (Para o utilizador verificar se pertencem à empresa ou se o NIF estava incorreto)
  // =========================================================================
  interface UnrecPdfItem {
    supplier: string;
    nif: string;
    internalDocNumber?: string;
    documentNumber: string;
    date: string;
    amount: number;
    pdfFileName?: string;
    pageNumber?: number;
    motivo: string;
  }

  const unreconciledPdfInvoices: UnrecPdfItem[] = [];

  for (const s of summary.suppliers) {
    for (const inv of s.allPdfInvoices) {
      if (!inv.isReconciled) {
        let motivo = "Lançado na contabilidade mas ausente no e-Fatura (confirmar se pertence à empresa)";
        if (s.status === "nao_reconciliado" && s.excelInvoicesCount === 0) {
          motivo = "Fornecedor não tem qualquer movimento registado no e-Fatura da AT";
        } else if (s.status === "parcialmente_reconciliado") {
          motivo = "Fatura/valor lançado na contabilidade mas sem correspondência no e-Fatura nesta data";
        }

        unreconciledPdfInvoices.push({
          supplier: s.supplierName,
          nif: s.nif || inv.nif || "N/A",
          internalDocNumber: inv.internalDocNumber || "—",
          documentNumber: inv.documentNumber || "DOC",
          date: inv.date,
          amount: inv.amount,
          pdfFileName: inv.pdfFileName,
          pageNumber: inv.pageNumber,
          motivo,
        });
      }
    }
  }

  // Ordenar por fornecedor e data
  unreconciledPdfInvoices.sort((a, b) => {
    const comp = a.supplier.localeCompare(b.supplier);
    if (comp !== 0) return comp;
    return a.date.localeCompare(b.date);
  });

  const sheet2Headers = [
    "Fornecedor",
    "NIF",
    "Nº Interno",
    "Nº Documento",
    "Data Contabilidade",
    "Valor Lançado (€)",
    "Estado",
    "Situação / Ação a Realizar",
    "Documento de Origem",
    "Página no PDF",
  ];

  const sheet2Data: any[][] = [sheet2Headers];
  let totalUnrecAmount = 0;

  for (const item of unreconciledPdfInvoices) {
    totalUnrecAmount += item.amount;
    const dateSerial = dateToExcelSerial(item.date) ?? item.date;
    sheet2Data.push([
      item.supplier,
      item.nif,
      item.internalDocNumber || "—",
      item.documentNumber,
      dateSerial,
      item.amount,
      "Não Reconciliado",
      item.motivo,
      item.pdfFileName || "Extracto Contabilidade",
      item.pageNumber ? `Pág. ${item.pageNumber}` : "—",
    ]);
  }

  // Linha de totalização no final
  sheet2Data.push([]);
  sheet2Data.push([
    "TOTAL NÃO NO E-FATURA",
    "",
    "",
    `${unreconciledPdfInvoices.length} faturas`,
    "",
    Number(totalUnrecAmount.toFixed(2)),
    "",
    "Confirmar se estas faturas foram emitidas com NIF diferente ou se pertencem à empresa",
    "",
    "",
  ]);

  const wsUnrec = XLSX.utils.aoa_to_sheet(sheet2Data);

  // Larguras de colunas da Folha 2
  wsUnrec["!cols"] = [
    { wch: 38 }, // Fornecedor
    { wch: 15 }, // NIF
    { wch: 14 }, // Nº Interno
    { wch: 22 }, // Nº Documento
    { wch: 16 }, // Data Contabilidade
    { wch: 16 }, // Valor (€)
    { wch: 18 }, // Estado
    { wch: 65 }, // Situação / Ação
    { wch: 32 }, // Ficheiro
    { wch: 14 }, // Página
  ];

  // Estilos da Folha 2
  const unrecHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "1E293B" } }, // Navy escuro
    font: { color: { rgb: "FFFFFF" }, bold: true },
    alignment: { vertical: "center" },
  };

  const warningBadgeStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FEE2E2" } }, // Rose/vermelho suave
    font: { color: { rgb: "991B1B" }, bold: true },
    alignment: { horizontal: "center" },
  };

  const totalRowStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
    font: { bold: true },
  };

  // Aplicar estilos ao cabeçalho da Folha 2
  for (let c = 0; c < sheet2Headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (wsUnrec[addr]) wsUnrec[addr].s = unrecHeaderStyle;
  }

  // Aplicar estilos e formatação às linhas de dados da Folha 2
  for (let r = 1; r <= unreconciledPdfInvoices.length; r++) {
    // Data Contabilidade (coluna 4)
    const dateAddr = XLSX.utils.encode_cell({ r, c: 4 });
    if (wsUnrec[dateAddr]) {
      wsUnrec[dateAddr].z = "dd/mm/yyyy";
      wsUnrec[dateAddr].s = { alignment: { horizontal: "center" } };
    }

    // Valor Lançado (€) (coluna 5)
    const amountAddr = XLSX.utils.encode_cell({ r, c: 5 });
    if (wsUnrec[amountAddr]) {
      wsUnrec[amountAddr].z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
    }

    // Estado (coluna 6)
    const statusAddr = XLSX.utils.encode_cell({ r, c: 6 });
    if (wsUnrec[statusAddr]) {
      wsUnrec[statusAddr].s = warningBadgeStyle;
    }
  }

  // Aplicar estilos à linha de total
  const totalRowIdx = unreconciledPdfInvoices.length + 2;
  for (let c = 0; c < sheet2Headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
    if (wsUnrec[addr]) wsUnrec[addr].s = totalRowStyle;
  }
  const totalAmountAddr = XLSX.utils.encode_cell({ r: totalRowIdx, c: 5 });
  if (wsUnrec[totalAmountAddr]) {
    wsUnrec[totalAmountAddr].z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
  }

  // Adicionar Folha 2 ao livro Excel
  XLSX.utils.book_append_sheet(wb, wsUnrec, "Não no e-Fatura (Contab)");

  // Gerar e descarregar ficheiro
  const baseName = originalFile.name.replace(/\.[^/.]+$/, "");
  const finalFileName = outputFileName || `${baseName}_RECONCILIADO_PINTADO.xlsx`;

  XLSX.writeFile(wb, finalFileName);

  return {
    reconciledCount: reconciledRowIndices.size,
    totalCount: totalExcelInvoices,
    unreconciledPdfCount: unreconciledPdfInvoices.length,
    unreconciledPdfAmount: Number(totalUnrecAmount.toFixed(2)),
  };
}

/**
 * Exporta os resultados da reconciliação para um ficheiro Excel (.xlsx) profissional
 * composto por 3 folhas de cálculo:
 * 1. Resumo por Fornecedor
 * 2. Dias Não Reconciliados
 * 3. Faturas Sem Correspondência (inclui movimentos lançados só na contabilidade)
 */
export function exportReconciliationToExcel(
  summary: GlobalReconciliationSummary,
  fileName: string = "Reconciliacao_Faturas_Interconta.xlsx"
): void {
  const wb = XLSX.utils.book_new();

  // FOLHA 1: Resumo Fornecedores
  const sheet1Data: any[][] = [
    [
      "Fornecedor",
      "NIF",
      "Total Excel (€)",
      "Total Contabilidade (€)",
      "Diferença (€)",
      "Qtd. Faturas Excel",
      "Qtd. Faturas Contab.",
      "Dias Reconciliados",
      "Dias Divergentes",
      "Estado",
    ],
  ];

  for (const s of summary.suppliers) {
    const estadoLabels: Record<string, string> = {
      reconciliado: "Reconciliado",
      parcialmente_reconciliado: "Parcialmente Reconciliado",
      nao_reconciliado: "Não Reconciliado",
    };

    sheet1Data.push([
      s.supplierName,
      s.nif || "N/A",
      s.totalExcel,
      s.totalPdf,
      s.difference,
      s.excelInvoicesCount,
      s.pdfInvoicesCount,
      s.correctDaysCount,
      s.discrepantDaysCount,
      estadoLabels[s.status] || s.status,
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  for (let r = 1; r <= summary.suppliers.length; r++) {
    for (const c of [2, 3, 4]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws1[addr]) ws1[addr].z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
    }
  }
  XLSX.utils.book_append_sheet(wb, ws1, "Resumo Fornecedores");

  // FOLHA 2: Dias Não Reconciliados
  const sheet2Data: any[][] = [
    [
      "Fornecedor",
      "NIF",
      "Data",
      "Total Excel (€)",
      "Total Contabilidade (€)",
      "Diferença (€)",
      "Faturas Excel (Nº e Valor)",
      "Faturas Contabilidade (Nº e Valor)",
      "Situação",
    ],
  ];

  for (const s of summary.suppliers) {
    for (const d of s.dayDiscrepancies) {
      const situacaoLabels: Record<string, string> = {
        diferenca: "Diferença de Valores",
        apenas_excel: "Existe apenas no Excel",
        apenas_pdf: "Existe apenas na Contabilidade",
      };

      const excelDocsStr = d.excelInvoices
        .map((inv) => `${inv.documentNumber} (${inv.amount.toFixed(2)} €)`)
        .join("; ");

      const pdfDocsStr = d.pdfInvoices
        .map((inv) => `${inv.documentNumber} (${inv.amount.toFixed(2)} €)`)
        .join("; ");

      const dateSerial = dateToExcelSerial(d.date) ?? d.date;

      sheet2Data.push([
        s.supplierName,
        s.nif || "N/A",
        dateSerial,
        d.totalExcel,
        d.totalPdf,
        d.difference,
        excelDocsStr || "Nenhum",
        pdfDocsStr || "Nenhum",
        situacaoLabels[d.status] || d.status,
      ]);
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  for (let r = 1; r < sheet2Data.length; r++) {
    const dateAddr = XLSX.utils.encode_cell({ r, c: 2 });
    if (ws2[dateAddr] && typeof ws2[dateAddr].v === "number") {
      ws2[dateAddr].z = "dd/mm/yyyy";
    }
    for (const c of [3, 4, 5]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws2[addr]) ws2[addr].z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
    }
  }
  XLSX.utils.book_append_sheet(wb, ws2, "Dias Não Reconciliados");

  // FOLHA 3: Faturas Sem Correspondência / Só na Contabilidade
  const sheet3Data: any[][] = [
    [
      "Origem",
      "Fornecedor",
      "NIF",
      "Nº Interno",
      "Nº Documento",
      "Data",
      "Valor Total (€)",
      "Situação / Observações",
    ],
  ];

  // 1. Faturas que existem no Excel mas não na contabilidade
  for (const s of summary.suppliers) {
    for (const inv of s.allExcelInvoices) {
      if (!inv.isReconciled) {
        const dateSerial = dateToExcelSerial(inv.date) ?? inv.date;
        sheet3Data.push([
          "A – Excel (e-Fatura)",
          inv.supplierRaw,
          inv.nif || s.nif || "N/A",
          "—",
          inv.documentNumber,
          dateSerial,
          inv.amount,
          "Consta no e-Fatura mas NÃO foi lançada na contabilidade",
        ]);
      }
    }
  }

  // 2. Faturas que existem na contabilidade mas NÃO no e-Fatura
  for (const s of summary.suppliers) {
    for (const inv of s.allPdfInvoices) {
      if (!inv.isReconciled) {
        const dateSerial = dateToExcelSerial(inv.date) ?? inv.date;
        sheet3Data.push([
          "B – Contabilidade (PDF)",
          inv.supplierRaw,
          inv.nif || s.nif || "N/A",
          inv.internalDocNumber || "—",
          inv.documentNumber,
          dateSerial,
          inv.amount,
          inv.pdfFileName
            ? `Lançado na contabilidade (${inv.pdfFileName}, Pág. ${inv.pageNumber || 1}) mas ausente no e-Fatura (confirmar se pertence à empresa)`
            : "Lançado na contabilidade mas ausente no e-Fatura (confirmar se pertence à empresa)",
        ]);
      }
    }
  }

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  for (let r = 1; r < sheet3Data.length; r++) {
    const dateAddr = XLSX.utils.encode_cell({ r, c: 5 });
    if (ws3[dateAddr] && typeof ws3[dateAddr].v === "number") {
      ws3[dateAddr].z = "dd/mm/yyyy";
    }
    const amtAddr = XLSX.utils.encode_cell({ r, c: 6 });
    if (ws3[amtAddr]) ws3[amtAddr].z = '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"';
  }
  XLSX.utils.book_append_sheet(wb, ws3, "Faturas Sem Correspondência");

  // Gravar e descarregar no browser
  XLSX.writeFile(wb, fileName);
}
