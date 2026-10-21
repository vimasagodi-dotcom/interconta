import * as XLSX from "xlsx";
import { InvoiceItem, toCents, extractAndValidateNif, normalizeSupplierName } from "./reconciliation";
import type { ExtractedPdfInvoice } from "./pdfExtractor";

export interface ExcelColumnMapping {
  supplierCol: string;
  nifCol?: string;
  docNumberCol: string;
  dateCol: string;
  amountCol: string;
}

export interface ExcelParsedPreview {
  headers: string[];
  rawRows: Record<string, any>[];
  detectedMapping: ExcelColumnMapping;
  fileName: string;
}

const STORAGE_MAPPING_KEY = "interconta_reconciliation_excel_mapping";

/**
 * Heurísticas para deteção automática dos cabeçalhos das colunas
 */
export function detectExcelColumns(headers: string[]): ExcelColumnMapping {
  const normalizeHeader = (h: string) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const normalized = headers.map(normalizeHeader);

  const findCol = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex((h) => h.includes(pattern));
      if (idx !== -1) return headers[idx];
    }
    return "";
  };

  const supplierCol = findCol([
    "fornecedor",
    "emitente",
    "entidade",
    "terceiro",
    "nomefornecedor",
    "nome",
    "supplier",
    "empresa",
    "credor",
  ]);

  const nifCol = findCol(["nif", "contribuinte", "vat", "niffornecedor", "nifemitente"]);

  const docNumberCol = findCol([
    "numdoc",
    "numerodoc",
    "ndoc",
    "fatura",
    "numfatura",
    "documento",
    "document",
    "doc",
    "ft",
    "numero",
    "invoice",
  ]);

  const dateCol = findCol([
    "datadoc",
    "dataemissao",
    "datadocto",
    "datafatura",
    "data",
    "date",
    "emissao",
  ]);

  const amountCol = findCol([
    "valortotal",
    "totalcomiva",
    "total",
    "valor",
    "montante",
    "liquido",
    "totaldoc",
    "amount",
  ]);

  return {
    supplierCol: supplierCol || headers[0] || "",
    nifCol: nifCol || undefined,
    docNumberCol: docNumberCol || headers[1] || "",
    dateCol: dateCol || headers[2] || "",
    amountCol: amountCol || headers[3] || "",
  };
}

/**
 * Guarda o mapeamento de colunas em localStorage (apenas os nomes das colunas, SEM dados financeiros).
 */
export function saveSavedColumnMapping(mapping: ExcelColumnMapping): void {
  try {
    localStorage.setItem(STORAGE_MAPPING_KEY, JSON.stringify(mapping));
  } catch {
    // Silently fail se o localStorage não estiver disponível
  }
}

/**
 * Recupera o último mapeamento guardado pelo utilizador.
 */
export function getSavedColumnMapping(): Partial<ExcelColumnMapping> | null {
  try {
    const raw = localStorage.getItem(STORAGE_MAPPING_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Converte qualquer valor em euros a partir de formato português ou numérico
 * Suporta: "1.234,56 €", "1234,56", "1 234,56", 1234.56, etc.
 */
export function parsePortugueseAmount(value: any): number {
  if (typeof value === "number") {
    return isNaN(value) ? 0 : value;
  }
  if (!value) return 0;

  let str = String(value).trim();
  // Remover símbolo de euro e espaços
  str = str.replace(/€/g, "").replace(/\s/g, "");

  // Se tiver formato português com pontos como separadores de milhares e vírgula decimal: "1.234,56"
  if (str.includes(",") && str.includes(".")) {
    // "1.234,56" -> remover pontos, substituir vírgula por ponto
    str = str.replace(/\./g, "").replace(/,/g, ".");
  } else if (str.includes(",")) {
    // "1234,56" -> substituir vírgula por ponto
    str = str.replace(/,/g, ".");
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Extrai o NIF e limpa o nome do fornecedor caso venham combinados na mesma célula
 * Exemplo comum no e-Fatura: "117694363 - Maria do Sameiro Teixeira Maia Silverio"
 */
export function extractNifAndCleanSupplier(str: string): { nif?: string; cleanName: string } {
  if (!str) return { nif: undefined, cleanName: "" };
  let s = String(str).trim();

  // Padrão 1: "117694363 - Nome do Fornecedor" ou "117694363 : Nome"
  const leadingMatch = s.match(/^([A-Za-z0-9]{8,14})\s*[-–—:]\s*(.+)$/);
  if (leadingMatch) {
    const extractedNif = extractAndValidateNif(leadingMatch[1]) || leadingMatch[1].trim().toUpperCase();
    return {
      nif: extractedNif,
      cleanName: leadingMatch[2].trim(),
    };
  }

  // Padrão 2: "Nome do Fornecedor (117694363)" ou "Nome - 117694363"
  const trailingMatch = s.match(/^(.+?)\s*[\(\[-]\s*([A-Za-z0-9]{8,14})[\)\]]?$/);
  if (trailingMatch) {
    const extractedNif = extractAndValidateNif(trailingMatch[2]) || trailingMatch[2].trim().toUpperCase();
    return {
      nif: extractedNif,
      cleanName: trailingMatch[1].trim(),
    };
  }

  // Padrão 3: NIF de 9 dígitos isolado na string
  const isolatedMatch = s.match(/\b([1235689]\d{8})\b/);
  if (isolatedMatch) {
    const nif = isolatedMatch[1];
    const cleanName = s
      .replace(nif, "")
      .replace(/[-–—:()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      nif,
      cleanName: cleanName || s,
    };
  }

  return { nif: undefined, cleanName: s };
}

/**
 * Limpa o número de documento removendo o código ATCUD se vier no formato do e-Fatura:
 * Ex: "FR U003/147002 / JFK87J4D-147002" -> "FR U003/147002"
 */
export function cleanDocNumber(str: string): string {
  if (!str) return "";
  return String(str).split(/\s+\/\s+/)[0].trim();
}

/**
 * Converte datas para o formato ISO YYYY-MM-DD
 * Suporta formatos portugueses: DD/MM/AAAA, DD-MM-AAAA, AAAA-MM-DD, datas seriais do Excel
 * e formato do portal das Finanças / e-Fatura: M/D/YY (ex: 1/23/26 -> 2026-01-23)
 */
export function parsePortugueseDate(value: any, preferDayFirst = false): string {
  if (!value) return "";

  // Caso seja número de série do Excel (ex: 45352)
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Caso seja Date do JavaScript
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  const str = String(value).trim();

  // Caso ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Caso com barras ou traços: M/D/YY, M/D/YYYY, DD/MM/YYYY, DD-MM-YYYY
  const slashMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let year = slashMatch[3];
    if (year.length === 2) {
      year = "20" + year;
    }

    let day = "";
    let month = "";

    // Se o primeiro número > 12, é certamente DD/MM/YYYY (ex: 23/01/2026)
    if (p1 > 12) {
      day = String(p1).padStart(2, "0");
      month = String(p2).padStart(2, "0");
    } else if (p2 > 12) {
      // Se o segundo número > 12, é certamente MM/DD/YYYY (ex: 1/23/26 do e-Fatura)
      month = String(p1).padStart(2, "0");
      day = String(p2).padStart(2, "0");
    } else {
      // Se ambos <= 12:
      // Se tiver traço '-' (ex: 11-03-2026) ou preferDayFirst = true, é formato português DD-MM-YYYY
      if (preferDayFirst || str.includes("-")) {
        day = String(p1).padStart(2, "0");
        month = String(p2).padStart(2, "0");
      } else {
        // No e-Fatura da AT em formato americano M/D/YY com barras '/'
        month = String(p1).padStart(2, "0");
        day = String(p2).padStart(2, "0");
      }
    }

    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return "";
}

/**
 * Lê o ficheiro Excel/CSV e retorna os cabeçalhos e as linhas para pré-visualização.
 */
export async function parseExcelPreview(file: File): Promise<ExcelParsedPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

  if (!workbook.SheetNames.length) {
    throw new Error("O ficheiro Excel não contém nenhuma folha de cálculo.");
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Obter dados em formato JSON (array de objetos onde as chaves são os cabeçalhos)
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    throw new Error("A folha de cálculo está vazia ou não contém dados válidos.");
  }

  const headers = Object.keys(rows[0]);
  const detected = detectExcelColumns(headers);

  // Se houver mapeamento previamente gravado e as colunas existirem, aplicar
  const saved = getSavedColumnMapping();
  if (saved) {
    if (saved.supplierCol && headers.includes(saved.supplierCol)) detected.supplierCol = saved.supplierCol;
    if (saved.nifCol && headers.includes(saved.nifCol)) detected.nifCol = saved.nifCol;
    if (saved.docNumberCol && headers.includes(saved.docNumberCol)) detected.docNumberCol = saved.docNumberCol;
    if (saved.dateCol && headers.includes(saved.dateCol)) detected.dateCol = saved.dateCol;
    if (saved.amountCol && headers.includes(saved.amountCol)) detected.amountCol = saved.amountCol;
  }

  return {
    headers,
    rawRows: rows,
    detectedMapping: detected,
    fileName: file.name,
  };
}

/**
 * Transforma as linhas brutas do Excel na lista padronizada de InvoiceItem
 * aplicando o mapeamento de colunas selecionado pelo utilizador.
 */
export function extractInvoicesFromExcel(
  rows: Record<string, any>[],
  mapping: ExcelColumnMapping
): InvoiceItem[] {
  const items: InvoiceItem[] = [];

  rows.forEach((row, index) => {
    let rawSupplier = String(row[mapping.supplierCol] || "").trim();
    let rawDocNum = String(row[mapping.docNumberCol] || "").trim();
    const rawDate = row[mapping.dateCol];
    const rawAmount = row[mapping.amountCol];
    let rawNif = mapping.nifCol ? String(row[mapping.nifCol] || "").trim() : undefined;

    // Se não tiver fornecedor ou valor, ignorar linhas vazias de rodapé
    if (!rawSupplier && !rawDocNum && !rawAmount) return;

    // Se o NIF não estiver numa coluna separada, extrair da string do fornecedor (ex: "117694363 - Maria...")
    const extractedSupplier = extractNifAndCleanSupplier(rawSupplier);
    if (!rawNif && extractedSupplier.nif) {
      rawNif = extractedSupplier.nif;
    }
    const cleanSupplierName = extractedSupplier.cleanName || rawSupplier;

    // Limpar sufixo ATCUD no número de documento (ex: "FR U003/147002 / JFK87J4D-147002" -> "FR U003/147002")
    const cleanDoc = cleanDocNumber(rawDocNum);

    const date = parsePortugueseDate(rawDate);
    let amount = parsePortugueseAmount(rawAmount);
    const nif = extractAndValidateNif(rawNif);

    // Deteção de Nota de Crédito (no e-Fatura da AT ou outros ficheiros Excel):
    // 1) Pelo número de documento: inicia por "NC" ou "NFR" ou padrão regex /\bNC[\s\/-]/i
    // 2) Pelo campo Tipo ou Descrição na linha (ex: "Nota de crédito", "Nota de credito", "NC")
    const isCreditNote = (
      cleanDoc.toUpperCase().startsWith("NC") ||
      cleanDoc.toUpperCase().startsWith("NFR") ||
      /\bNC[\s\/-]/i.test(cleanDoc) ||
      Object.entries(row).some(([key, val]) => {
        const k = key.toLowerCase();
        const v = String(val || "").toLowerCase();
        return (
          (k.includes("tipo") || k.includes("desc") || k.includes("natureza") || k.includes("doc")) &&
          (v.includes("crédito") || v.includes("credito") || v === "nc")
        );
      })
    );

    if (isCreditNote) {
      amount = -Math.abs(amount);
    }

    // Deteção de Base Tributável (valor líquido de incidência sem IVA)
    let rawBaseAmount: any = undefined;
    for (const [key, val] of Object.entries(row)) {
      const k = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (
        (k.includes("base") && (k.includes("trib") || k.includes("incid") || k.includes("impon") || k.includes("liq"))) ||
        k === "base tributavel" ||
        k === "base tributaria" ||
        k === "base incidencia" ||
        k === "base"
      ) {
        rawBaseAmount = val;
        break;
      }
    }

    let baseAmount: number | undefined = undefined;
    let baseAmountCents: number | undefined = undefined;

    if (rawBaseAmount !== undefined && rawBaseAmount !== "") {
      let bVal = parsePortugueseAmount(rawBaseAmount);
      if (isCreditNote) {
        bVal = -Math.abs(bVal);
      }
      baseAmount = bVal;
      baseAmountCents = toCents(bVal);
    }

    items.push({
      id: `excel_${index + 1}_${Date.now()}`,
      supplierRaw: cleanSupplierName || "Fornecedor Desconhecido",
      supplierNormalized: normalizeSupplierName(cleanSupplierName || "Fornecedor Desconhecido"),
      nif,
      documentNumber: cleanDoc || `DOC-${index + 1}`,
      date: date || new Date().toISOString().split("T")[0],
      amount,
      amountCents: toCents(amount),
      baseAmount,
      baseAmountCents,
      source: "excel",
      excelRowIndex: index,
    });
  });

  return items;
}

/**
 * Extrai faturas de um ficheiro Excel exportado da contabilidade (Primavera, PHC, TOConline, Sage, etc.)
 * Suporta tanto tabelas planas (com colunas Nome, Tipo, Data, Nº Interno, Nº Doc, Devoluções, Vendas, etc.)
 * como extratos agrupados com cabeçalho de fornecedor por secção.
 */
export async function extractInvoicesFromAccountingExcel(
  fileOrBuffer: File | ArrayBuffer,
  fileName?: string
): Promise<ExtractedPdfInvoice[]> {
  let buffer: ArrayBuffer;
  let actualFileName = fileName || "contabilidade.xlsx";

  if (typeof window !== "undefined" && fileOrBuffer instanceof File) {
    buffer = await fileOrBuffer.arrayBuffer();
    actualFileName = fileOrBuffer.name;
  } else {
    buffer = fileOrBuffer as ArrayBuffer;
  }

  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
  const items: ExtractedPdfInvoice[] = [];

  for (let sIdx = 0; sIdx < wb.SheetNames.length; sIdx++) {
    const sheetName = wb.SheetNames[sIdx];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    // Converter folha em matriz 2D de linhas
    const sheetRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (!sheetRows.length) continue;

    const norm = (s: any) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    // Localizar a linha de cabeçalhos procurando palavras-chave de contabilidade
    let headerRowIdx = -1;
    const colIndices = {
      supplier: -1,
      nif: -1,
      date: -1,
      internalDoc: -1,
      docNumber: -1,
      tipo: -1,
      descritivo: -1,
      devolucoes: -1,
      vendas: -1,
      debito: -1,
      credito: -1,
      amount: -1,
    };

    for (let r = 0; r < Math.min(sheetRows.length, 25); r++) {
      const row = sheetRows[r];
      let matches = 0;

      for (let c = 0; c < row.length; c++) {
        const val = norm(row[c]);
        if (val.includes("data") || val.includes("date") || val.includes("emissao")) matches++;
        if (val.includes("doc") || val.includes("fatura") || val.includes("factura")) matches++;
        if (val.includes("interno") || val.includes("numinterno") || val.includes("lancamento")) matches++;
        if (val.includes("devoluc") || val.includes("venda") || val.includes("debito") || val.includes("credito") || val.includes("valor")) matches++;
      }

      if (matches >= 2) {
        headerRowIdx = r;
        break;
      }
    }

    // Se encontrou a linha de cabeçalho, mapear cada coluna
    if (headerRowIdx !== -1) {
      const hRow = sheetRows[headerRowIdx];
      for (let c = 0; c < hRow.length; c++) {
        const h = norm(hRow[c]);
        if (!h) continue;

        if (colIndices.supplier === -1 && (h.includes("fornecedor") || h.includes("nome") || h.includes("terceiro") || h.includes("entidade"))) {
          colIndices.supplier = c;
        } else if (colIndices.nif === -1 && (h.includes("nif") || h.includes("contribuinte") || h.includes("vat"))) {
          colIndices.nif = c;
        } else if (colIndices.date === -1 && (h.includes("data") || h.includes("date") || h.includes("emissao") || h.includes("lancamento"))) {
          colIndices.date = c;
        } else if (colIndices.internalDoc === -1 && (h.includes("interno") || h.includes("numinterno") || h.includes("registo") || h.includes("lancamento"))) {
          colIndices.internalDoc = c;
        } else if (colIndices.docNumber === -1 && (h.includes("doc") || h.includes("fatura") || h.includes("factura") || h.includes("numero"))) {
          colIndices.docNumber = c;
        } else if (colIndices.tipo === -1 && h.includes("tipo")) {
          colIndices.tipo = c;
        } else if (colIndices.descritivo === -1 && (h.includes("descritivo") || h.includes("descricao"))) {
          colIndices.descritivo = c;
        } else if (colIndices.devolucoes === -1 && (h.includes("devoluc") || h.includes("nota de credito") || h.includes("n/ credito"))) {
          colIndices.devolucoes = c;
        } else if (colIndices.vendas === -1 && (h.includes("venda") || h.includes("valor fatura") || h.includes("compras"))) {
          colIndices.vendas = c;
        } else if (colIndices.debito === -1 && h.includes("debito")) {
          colIndices.debito = c;
        } else if (colIndices.credito === -1 && h.includes("credito")) {
          colIndices.credito = c;
        } else if (colIndices.amount === -1 && (h.includes("valor") || h.includes("montante") || h.includes("total") || h.includes("saldo"))) {
          colIndices.amount = c;
        }
      }
    }

    // Contexto de fornecedor para extratos agrupados
    let currentSupplier = "";
    let currentNif: string | undefined = undefined;

    for (let r = 0; r < sheetRows.length; r++) {
      if (r === headerRowIdx) continue;
      const row = sheetRows[r];
      if (!row || row.length === 0) continue;

      const fullRowText = row.map((v) => String(v || "").trim()).filter(Boolean).join(" ");
      if (!fullRowText) continue;

      // Ignorar linhas de totalização ou sub-totais
      if (
        /sub-total/i.test(fullRowText) ||
        /^total\b/i.test(fullRowText) ||
        /total geral/i.test(fullRowText) ||
        /total da conta/i.test(fullRowText) ||
        /totais/i.test(fullRowText)
      ) {
        continue;
      }

      // Verificar se a linha declara um novo fornecedor (ex: "Conta: 22111109 - Medseghi... NIF: 513295445")
      const isolatedNif = fullRowText.match(/\b([1235689]\d{8})\b/);
      if (
        fullRowText.toLowerCase().includes("conta:") ||
        fullRowText.toLowerCase().includes("fornecedor:") ||
        (isolatedNif && !row.some((cell) => parsePortugueseDate(cell, true)))
      ) {
        if (isolatedNif) {
          currentNif = isolatedNif[1];
        }
        const cleanedSupp = fullRowText
          .replace(/conta:\s*\d+/i, "")
          .replace(/fornecedor:\s*/i, "")
          .replace(/\b[1235689]\d{8}\b/g, "")
          .replace(/nif:\s*/i, "")
          .replace(/[-–—:()]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (cleanedSupp.length > 2) {
          currentSupplier = cleanedSupp;
        }
      }

      // --- DETEÇÃO DA LINHA DE MOVIMENTO CONTABILÍSTICO ---
      // Localizar o NIF na linha (1ª coluna ou uma das primeiras colunas)
      let rowNif: string | undefined = undefined;
      let nifColIdx = -1;

      if (colIndices.nif !== -1 && row[colIndices.nif]) {
        rowNif = extractAndValidateNif(String(row[colIndices.nif]));
        nifColIdx = colIndices.nif;
      }

      if (!rowNif) {
        // Verificar se a coluna 0 (1ª coluna) ou coluna 1 tem um NIF válido de 9 dígitos
        for (let c = 0; c < Math.min(row.length, 3); c++) {
          if (parsePortugueseDate(row[c], true)) continue;
          const candidate = extractAndValidateNif(String(row[c] || ""));
          if (candidate) {
            rowNif = candidate;
            nifColIdx = c;
            break;
          }
        }
      }

      // Localizar Data (4ª coluna no layout padrão, ou coluna mapeada, ou qualquer célula com data)
      let date = "";
      if (colIndices.date !== -1 && row[colIndices.date]) {
        date = parsePortugueseDate(row[colIndices.date], true);
      }
      if (!date && nifColIdx !== -1 && row[nifColIdx + 3]) {
        date = parsePortugueseDate(row[nifColIdx + 3], true);
      }
      if (!date) {
        for (const cell of row) {
          const parsed = parsePortugueseDate(cell, true);
          if (parsed) {
            date = parsed;
            break;
          }
        }
      }

      if (!date) continue; // Sem data válida, não é uma linha de movimento contabilístico

      // Localizar Fornecedor (2ª coluna no layout padrão)
      let rowSupplier = "";
      if (colIndices.supplier !== -1 && row[colIndices.supplier]) {
        rowSupplier = String(row[colIndices.supplier]).trim();
      }
      if (!rowSupplier && nifColIdx !== -1 && row[nifColIdx + 1]) {
        const candidate = String(row[nifColIdx + 1]).trim();
        if (candidate.length > 2 && !parsePortugueseDate(candidate, true) && isNaN(Number(candidate))) {
          rowSupplier = candidate;
        }
      }

      // Se a célula do fornecedor tiver o NIF incluído (ex: "508225442 - Nuno...")
      if (rowSupplier) {
        const ext = extractNifAndCleanSupplier(rowSupplier);
        if (ext.nif && !rowNif) rowNif = ext.nif;
        if (ext.cleanName) rowSupplier = ext.cleanName;
      }

      const finalSupplier = rowSupplier || currentSupplier || "Fornecedor Contabilidade";
      const finalNif = rowNif || currentNif;

      // Localizar Nº Interno (7ª coluna no layout padrão, ou seja index nifColIdx + 6)
      let internalDocNumber = "";
      if (colIndices.internalDoc !== -1 && row[colIndices.internalDoc]) {
        internalDocNumber = String(row[colIndices.internalDoc]).trim();
      }
      if (!internalDocNumber && nifColIdx !== -1 && row[nifColIdx + 6] !== undefined && row[nifColIdx + 6] !== "") {
        internalDocNumber = String(row[nifColIdx + 6]).trim();
      }

      // Localizar Nº Documento (8ª coluna no layout padrão, ou seja index nifColIdx + 7)
      let rawDoc = "";
      if (colIndices.docNumber !== -1 && row[colIndices.docNumber]) {
        rawDoc = String(row[colIndices.docNumber]).trim();
      }
      if (!rawDoc && nifColIdx !== -1 && row[nifColIdx + 7] !== undefined && row[nifColIdx + 7] !== "") {
        rawDoc = String(row[nifColIdx + 7]).trim();
      }
      const documentNumber = cleanDocNumber(rawDoc) || `DOC-${r + 1}`;

      // Localizar Tipo de Documento e Descritivo (3ª coluna tipo, 9ª coluna descritivo)
      let tipo = "";
      if (colIndices.tipo !== -1 && row[colIndices.tipo]) {
        tipo = String(row[colIndices.tipo]).trim().toUpperCase();
      }
      if (!tipo && nifColIdx !== -1 && row[nifColIdx + 2]) {
        tipo = String(row[nifColIdx + 2]).trim().toUpperCase();
      }

      let desc = "";
      if (colIndices.descritivo !== -1 && row[colIndices.descritivo]) {
        desc = String(row[colIndices.descritivo]).toLowerCase();
      }
      if (!desc && nifColIdx !== -1 && row[nifColIdx + 8]) {
        desc = String(row[nifColIdx + 8]).toLowerCase();
      }

      const isCreditNote =
        tipo === "NC" ||
        tipo === "VNC" ||
        tipo === "FD" ||
        desc.includes("credito") ||
        desc.includes("devolu") ||
        documentNumber.toUpperCase().startsWith("NC");

      // Localizar Montantes (10ª coluna = Nota de Crédito / Devoluções; 11ª coluna = Valor Fatura / Vendas)
      let amount = 0;

      const ncIdx = colIndices.devolucoes !== -1 ? colIndices.devolucoes : (nifColIdx !== -1 ? nifColIdx + 9 : (row.length >= 11 ? 9 : -1));
      const fatIdx = colIndices.vendas !== -1 ? colIndices.vendas : (nifColIdx !== -1 ? nifColIdx + 10 : (row.length >= 11 ? 10 : -1));

      if (ncIdx !== -1 && fatIdx !== -1 && (row[ncIdx] !== undefined || row[fatIdx] !== undefined)) {
        const ncVal = parsePortugueseAmount(row[ncIdx]);
        const fatVal = parsePortugueseAmount(row[fatIdx]);

        if (ncVal !== 0) {
          // Nota de crédito / devolução -> SEMPRE negativo
          amount = -Math.abs(ncVal);
        } else if (fatVal !== 0) {
          amount = isCreditNote ? -Math.abs(fatVal) : Math.abs(fatVal);
        }
      } else if (colIndices.debito !== -1 && colIndices.credito !== -1) {
        const deb = parsePortugueseAmount(row[colIndices.debito]);
        const cred = parsePortugueseAmount(row[colIndices.credito]);
        if (isCreditNote) {
          amount = -Math.abs(deb > 0 ? deb : cred);
        } else if (cred > 0) {
          amount = cred;
        } else if (deb > 0) {
          amount = -deb;
        }
      } else if (colIndices.amount !== -1 && row[colIndices.amount]) {
        const val = parsePortugueseAmount(row[colIndices.amount]);
        amount = isCreditNote ? -Math.abs(val) : val;
      } else {
        // Fallback: se linha tiver pelo menos 11 colunas, verificar colunas 10 (idx 9) e 11 (idx 10)
        if (row.length >= 11) {
          const ncVal = parsePortugueseAmount(row[9]);
          const fatVal = parsePortugueseAmount(row[10]);
          if (ncVal !== 0) {
            amount = -Math.abs(ncVal);
          } else if (fatVal !== 0) {
            amount = isCreditNote ? -Math.abs(fatVal) : Math.abs(fatVal);
          }
        }

        // Se ainda for 0, procurar a última célula antes do saldo acumulado
        if (amount === 0) {
          for (let c = row.length - 2; c >= 0; c--) {
            const val = parsePortugueseAmount(row[c]);
            if (val !== 0) {
              amount = isCreditNote ? -Math.abs(val) : val;
              break;
            }
          }
        }
      }

      if (amount === 0 && !internalDocNumber && !rawDoc) continue;

      items.push({
        id: `contab_excel_${sIdx + 1}_${r + 1}_${items.length + 1}`,
        supplierRaw: finalSupplier,
        supplierNormalized: normalizeSupplierName(finalSupplier),
        nif: extractAndValidateNif(finalNif),
        documentNumber,
        internalDocNumber: internalDocNumber || undefined,
        date,
        amount,
        amountCents: toCents(amount),
        source: "pdf",
        pdfFileName: actualFileName,
        pageNumber: r + 1,
        confidence: 1.0,
        lowConfidenceFields: [],
      });
    }
  }

  return items;
}

