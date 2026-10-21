import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import {
  InvoiceItem,
  toCents,
  extractAndValidateNif,
  normalizeSupplierName,
} from "./reconciliation";
import { parsePortugueseAmount, parsePortugueseDate } from "./excelParser";

// Configurar worker do PDF.js
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export interface ExtractedPdfInvoice extends InvoiceItem {
  pdfFileName: string;
  pageNumber: number;
  confidence: number;
  lowConfidenceFields: string[];
  rawExtractedText?: string;
  usedOcr?: boolean;
}

export interface ExtractionProgress {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  page: number;
  totalPages: number;
  stage: string;
  percent: number;
}

/**
 * Reconstrói linhas visuais ordenadas a partir das coordenadas geométricas dos itens do PDF.
 * Agrupa itens na mesma linha vertical (coordenada Y com tolerância) e ordena-os horizontalmente (coordenada X).
 */
export function reconstructLinesFromPdfItems(items: any[]): string[] {
  const validItems = items.filter(
    (it: any) => it && typeof it.str === "string" && it.str.trim().length > 0
  );
  if (!validItems.length) return [];

  // Agrupar por coordenada Y vertical (no PDF.js, transform[5] é Y)
  const linesMap: { y: number; items: any[] }[] = [];

  for (const item of validItems) {
    const y = item.transform ? Math.round(item.transform[5] * 10) / 10 : 0;
    const x = item.transform ? item.transform[4] : 0;

    let line = linesMap.find((l) => Math.abs(l.y - y) <= 3.5);
    if (!line) {
      line = { y, items: [] };
      linesMap.push(line);
    }
    line.items.push({ ...item, x });
  }

  // Ordenar linhas de cima para baixo (Y decrescente)
  linesMap.sort((a, b) => b.y - a.y);

  // Para cada linha, ordenar itens da esquerda para a direita (X crescente)
  const resultLines: string[] = [];
  for (const line of linesMap) {
    line.items.sort((a, b) => a.x - b.x);

    let lineText = "";
    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i === 0) {
        lineText += cur.str;
      } else {
        const prev = line.items[i - 1];
        const gap = cur.x - (prev.x + (prev.width || 0));
        if (gap > 2 || (!lineText.endsWith(" ") && !cur.str.startsWith(" "))) {
          lineText += " " + cur.str;
        } else {
          lineText += cur.str;
        }
      }
    }

    const trimmed = lineText.replace(/\s+/g, " ").trim();
    if (trimmed) {
      resultLines.push(trimmed);
    }
  }

  return resultLines;
}

/**
 * Parser para linhas de Extratos de Recapitulativos / Balancetes de Fornecedores da Contabilidade
 * Exemplo típico:
 * 117694363 Maria do Sameiro Teixeira Maia Silverio FC 23-01-2026 5 111 501035 FR U003/147002 V/ Fatura 0,00 10,47 10,47
 */
export function parseRecapitulativoLine(line: string): {
  nif: string;
  supplierName: string;
  tipo: string;
  date: string;
  docNumber: string;
  internalDocNumber?: string;
  amount: number;
} | null {
  const trimmed = line.trim();

  // Ignorar cabeçalhos, subtotais e rodapés comuns em extratos de contabilidade
  if (
    trimmed.startsWith("Sub-Total:") ||
    trimmed.startsWith("Total:") ||
    trimmed.startsWith("N.º Contr.") ||
    trimmed.startsWith("Todos os") ||
    trimmed.startsWith("Valores superiores") ||
    trimmed.includes("Extracto de recapitulativos") ||
    trimmed.includes("Documento emitido em:") ||
    trimmed.includes("Moreno Dias") ||
    trimmed.includes("Fornecedores")
  ) {
    return null;
  }

  // Regex para linha de extrato:
  // [NIF/N.º Contr] [Nome Fornecedor] [Tipo opcional FC/FD/FT...] [Data DD-MM-YYYY] [Resto: Doc e Valores]
  const rowMatch = trimmed.match(
    /^([A-Za-z0-9]{8,14})\s+(.+?)\s*(?:(FC|FD|FT|FR|NC|ND|FS)\s*)?(\d{2}[-\/\.]\d{2}[-\/\.]\d{4})\s+(.+)$/i
  );
  if (!rowMatch) return null;

  const nif = rowMatch[1].trim();
  let supplierName = rowMatch[2].trim();
  const tipo = (rowMatch[3] || "FC").toUpperCase();
  const rawDate = rowMatch[4];
  const rest = rowMatch[5].trim();

  // Limpar se o tipo de documento ficou encostado ao nome (ex: "VIDAFC")
  if (supplierName.endsWith("FC") || supplierName.endsWith("FD")) {
    supplierName = supplierName.slice(0, -2).trim();
  }

  // Formatar data para YYYY-MM-DD
  const dateParts = rawDate.split(/[-\/\.]/);
  let date = "";
  if (dateParts[0].length === 4) {
    date = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
  } else {
    date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
  }

  // O final da linha contém: Descritivo (V/ Fatura ou V/ Nota Credito) seguido dos valores
  const valuesMatch = rest.match(
    /(?:V\/\s*Fatura|V\/\s*Nota\s*Credito|Fatura|Nota\s*Credito)\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})\s+([\-]?[\d\s]+,\d{2})$/i
  );

  let docNumber = "";
  let internalDocNumber = "";
  let amount = 0;

  if (valuesMatch) {
    const desc = valuesMatch[0];
    const devolucoes = parsePortugueseAmount(valuesMatch[1]);
    const vendas = parsePortugueseAmount(valuesMatch[2]);

    if (tipo === "FD" || desc.toLowerCase().includes("credito") || devolucoes > 0) {
      amount = devolucoes > 0 ? -devolucoes : -vendas;
    } else {
      amount = vendas;
    }

    const beforeDesc = rest.substring(0, valuesMatch.index).trim();

    const m3 = beforeDesc.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (m3) {
      internalDocNumber = m3[3];
      docNumber = m3[4].trim();
    } else {
      const m2 = beforeDesc.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (m2) {
        internalDocNumber = m2[2];
        docNumber = m2[3].trim();
      } else {
        const docClean = beforeDesc
          .replace(/^\d+\s+\d+\s+\d+\s+/, "")
          .replace(/^\d+\s+\d+\s+/, "")
          .trim();
        docNumber = docClean || beforeDesc;
      }
    }
  } else {
    // Fallback: apanhar os últimos números da linha
    const numbers = Array.from(rest.matchAll(/([\-]?[\d\s]+,\d{2})/g));
    if (numbers.length >= 2) {
      const val = parsePortugueseAmount(numbers[numbers.length - 2][1]);
      amount = tipo === "FD" ? -Math.abs(val) : val;
    } else if (numbers.length === 1) {
      const val = parsePortugueseAmount(numbers[0][1]);
      amount = tipo === "FD" ? -Math.abs(val) : val;
    }

    const beforeNumbers = rest.split(/[\d\s]+,\d{2}/)[0].trim();

    const m3 = beforeNumbers.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (m3) {
      internalDocNumber = m3[3];
      docNumber = m3[4].trim();
    } else {
      const m2 = beforeNumbers.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (m2) {
        internalDocNumber = m2[2];
        docNumber = m2[3].trim();
      } else {
        const docClean = beforeNumbers
          .replace(/^\d+\s+\d+\s+\d+\s+/, "")
          .replace(/^\d+\s+\d+\s+/, "")
          .trim();
        docNumber = docClean || "DOC";
      }
    }
  }

  // Validar se o montante é um número válido
  if (amount === 0 && !trimmed.includes("0,00")) return null;

  return {
    nif,
    supplierName,
    tipo,
    date,
    docNumber,
    internalDocNumber: internalDocNumber || undefined,
    amount,
  };
}

/**
 * Heurísticas para extração de fatura individual (1 fatura por página/documento)
 */
export function parseInvoiceFieldsFromText(
  text: string,
  fileName: string,
  pageNumber: number
): {
  supplier: string;
  nif?: string;
  docNumber: string;
  date: string;
  amount: number;
  confidence: number;
  lowConfidenceFields: string[];
} {
  const lowConfidenceFields: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Extração de NIF emitente (9 dígitos iniciados por 1, 2, 3, 5, 6, 8, 9 ou NIF comunitário)
  let nif: string | undefined;
  const nifRegex = /(?:nif|nipc|contribuinte|vat|n\.º\s*contribuinte)[\s\.:#]*([A-Za-z0-9]{8,12})\b/i;
  const nifMatch = text.match(nifRegex);

  if (nifMatch) {
    nif = nifMatch[1];
  } else {
    const genericNifMatch = text.match(/\b([1235689]\d{8})\b/);
    if (genericNifMatch) {
      nif = genericNifMatch[1];
    }
  }

  // 2. Extração do Fornecedor / Razão Social
  let supplier = "";
  const supplierKeywordMatch = text.match(
    /(?:emitente|fornecedor|de|nome\s*emitente)[\s\.:]+([A-Za-z0-9À-ÿ\s\.\-&]{3,60})/i
  );

  if (supplierKeywordMatch && supplierKeywordMatch[1].trim().length > 2) {
    supplier = supplierKeywordMatch[1].trim().split(/\r?\n/)[0];
  } else {
    for (const line of lines.slice(0, 6)) {
      if (
        !line.match(/^(fatura|factura|original|duplicado|documento|pagina|recibo|nif)/i) &&
        line.length >= 3 &&
        !/^\d+$/.test(line)
      ) {
        supplier = line;
        break;
      }
    }
  }

  if (!supplier) {
    supplier = `Fornecedor Doc ${fileName} (Pág. ${pageNumber})`;
    lowConfidenceFields.push("supplierRaw");
  }

  // 3. Extração do Nº do Documento
  let docNumber = "";
  const docPatterns = [
    /\b((?:FT|FS|FR|NC|ND|VD|RC|NE|RG|FAC|FATURA|FACTURA)[\s\._\/-]+[A-Za-z0-9_\/-]{2,20})\b/i,
    /(?:fatura|factura|documento|doc\.?|n\.?º|nº|numero)[\s\.:#]*([A-Za-z0-9_\/-]{2,20})/i,
    /\b([A-Za-z]{1,4}[\s\/-]\d{1,4}\/\d{1,8})\b/,
  ];

  for (const regex of docPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      docNumber = match[1].trim();
      break;
    }
  }

  if (!docNumber) {
    docNumber = `DOC-${fileName.replace(/\.pdf$/i, "")}-P${pageNumber}`;
    lowConfidenceFields.push("documentNumber");
  }

  // 4. Extração da Data
  let date = "";
  const datePatterns = [
    /(?:data(?:\s*de\s*emissao|\s*do\s*documento|\s*doc\.?)?|emissao)[\s\.:]*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4})/i,
    /(?:data(?:\s*de\s*emissao|\s*do\s*documento|\s*doc\.?)?|emissao)[\s\.:]*(\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/i,
    /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ];

  for (const regex of datePatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = parsePortugueseDate(match[1]);
      if (parsed) {
        date = parsed;
        break;
      }
    }
  }

  if (!date) {
    date = new Date().toISOString().split("T")[0];
    lowConfidenceFields.push("date");
  }

  // 5. Extração do Valor Total
  let amount = 0;
  const amountPatterns = [
    /(?:total\s*a\s*pagar|total\s*do\s*documento|total\s*com\s*iva|total\s*liquido|total\s*eur|total\s*documento|valor\s*total)[\s\.:#]*([\d\.\s]+,\d{2}|\d+\.\d{2})/i,
    /(?:total|a\s*pagar)[\s\.:#]*€?\s*([\d\.\s]+,\d{2}|\d+\.\d{2})/i,
    /(?:valor|montante)[\s\.:#]*€?\s*([\d\.\s]+,\d{2}|\d+\.\d{2})/i,
  ];

  for (const regex of amountPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = parsePortugueseAmount(match[1]);
      if (parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  if (amount === 0) {
    const monetaryMatches = Array.from(text.matchAll(/\b([\d\.\s]+,\d{2})\b/g));
    let maxFound = 0;
    for (const m of monetaryMatches) {
      const v = parsePortugueseAmount(m[1]);
      if (v > maxFound && v < 10000000) {
        maxFound = v;
      }
    }
    if (maxFound > 0) {
      amount = maxFound;
    } else {
      lowConfidenceFields.push("amount");
    }
  }

  const totalFields = 4;
  const confidentFields = totalFields - lowConfidenceFields.length;
  const confidence = Number((confidentFields / totalFields).toFixed(2));

  return {
    supplier,
    nif,
    docNumber,
    date,
    amount,
    confidence,
    lowConfidenceFields,
  };
}

/**
 * Executa OCR na página através do Tesseract.js renderizando a página num Canvas HTML.
 */
async function performOcrOnPdfPage(
  page: pdfjsLib.PDFPageProxy,
  scale: number = 2.0
): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Não foi possível criar contexto Canvas para OCR.");
  }

  await page.render({ canvasContext: context, viewport }).promise;

  const worker = await createWorker("por");
  const ret = await worker.recognize(canvas);
  await worker.terminate();

  return ret.data.text || "";
}

/**
 * Extrai faturas de um ficheiro PDF.
 * Suporta inteligentemente tanto:
 * 1. Extratos e recapitulativos de contabilidade com múltiplas faturas por página
 * 2. PDFs de faturas individuais (uma por página/documento)
 */
export async function extractInvoicesFromPdfFile(
  file: File,
  fileIndex: number,
  totalFiles: number,
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractedPdfInvoice[]> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const totalPages = pdfDoc.numPages;
  const extractedInvoices: ExtractedPdfInvoice[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentFile: fileIndex + 1,
      totalFiles,
      fileName: file.name,
      page: pageNum,
      totalPages,
      stage: `A ler página ${pageNum} de ${totalPages}...`,
      percent: Math.round(((pageNum - 1) / totalPages) * 100),
    });

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // 1. Reconstruir linhas visuais com base nas coordenadas Y e X
    let visualLines = reconstructLinesFromPdfItems(textContent.items);
    let rawText = visualLines.join("\n").trim();
    let usedOcr = false;

    // Se a página não tem quase texto digital, tentar OCR
    if (rawText.length < 25) {
      onProgress?.({
        currentFile: fileIndex + 1,
        totalFiles,
        fileName: file.name,
        page: pageNum,
        totalPages,
        stage: `A executar OCR na página digitalizada ${pageNum}...`,
        percent: Math.round(((pageNum - 0.5) / totalPages) * 100),
      });

      try {
        const ocrText = await performOcrOnPdfPage(page);
        if (ocrText && ocrText.length > rawText.length) {
          rawText = ocrText;
          visualLines = ocrText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          usedOcr = true;
        }
      } catch (ocrErr) {
        console.warn("Aviso de falha no OCR:", ocrErr);
      }
    }

    // 2. TENTAR DETETAR LINHAS DE TABELA DE EXTRATO/RECAPITULATIVOS
    const pageTableInvoices: ExtractedPdfInvoice[] = [];

    for (let lineIdx = 0; lineIdx < visualLines.length; lineIdx++) {
      const line = visualLines[lineIdx];
      const parsedRow = parseRecapitulativoLine(line);
      if (parsedRow) {
        pageTableInvoices.push({
          id: `pdf_${file.name}_p${pageNum}_r${lineIdx + 1}_${Date.now()}_${Math.random()}`,
          supplierRaw: parsedRow.supplierName,
          supplierNormalized: normalizeSupplierName(parsedRow.supplierName),
          nif: extractAndValidateNif(parsedRow.nif) || parsedRow.nif,
          documentNumber: parsedRow.docNumber || `DOC-P${pageNum}-${lineIdx + 1}`,
          internalDocNumber: parsedRow.internalDocNumber,
          date: parsedRow.date,
          amount: parsedRow.amount,
          amountCents: toCents(parsedRow.amount),
          source: "pdf",
          confidence: 0.98,
          lowConfidenceFields: [],
          pdfFileName: file.name,
          pageNumber: pageNum,
          rawExtractedText: line,
          usedOcr,
        });
      }
    }

    // Se foram encontradas faturas em formato tabela (ex: Extrato de Recapitulativos)
    if (pageTableInvoices.length > 0) {
      extractedInvoices.push(...pageTableInvoices);
    } else {
      // 3. CASO CONTRÁRIO: TRATAR COMO FATURA INDIVIDUAL POR PÁGINA
      const parsed = parseInvoiceFieldsFromText(rawText, file.name, pageNum);

      extractedInvoices.push({
        id: `pdf_${file.name}_p${pageNum}_${Date.now()}`,
        supplierRaw: parsed.supplier,
        supplierNormalized: normalizeSupplierName(parsed.supplier),
        nif: parsed.nif,
        documentNumber: parsed.docNumber,
        date: parsed.date,
        amount: parsed.amount,
        amountCents: toCents(parsed.amount),
        source: "pdf",
        confidence: parsed.confidence,
        lowConfidenceFields: parsed.lowConfidenceFields,
        pdfFileName: file.name,
        pageNumber: pageNum,
        rawExtractedText: rawText.substring(0, 300),
        usedOcr,
      });
    }
  }

  return extractedInvoices;
}

/**
 * Processa uma lista de múltiplos ficheiros PDF sucessivamente com indicador de progresso.
 */
export async function extractInvoicesFromMultiplePdfs(
  files: File[],
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractedPdfInvoice[]> {
  const allInvoices: ExtractedPdfInvoice[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const invoices = await extractInvoicesFromPdfFile(file, i, files.length, onProgress);
    allInvoices.push(...invoices);
  }

  return allInvoices;
}
