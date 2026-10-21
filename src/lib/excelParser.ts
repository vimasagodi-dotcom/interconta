import * as XLSX from "xlsx";
import { InvoiceItem, toCents, extractAndValidateNif, normalizeSupplierName } from "./reconciliation";

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
export function parsePortugueseDate(value: any): string {
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

  // Caso com barras ou traços: M/D/YY, M/D/YYYY, DD/MM/YYYY
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
      // Se ambos <= 12 (ex: 3/6/26):
      // No e-Fatura da AT, o formato das exportações é M/D/YY
      month = String(p1).padStart(2, "0");
      day = String(p2).padStart(2, "0");
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
