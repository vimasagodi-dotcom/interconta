import * as XLSX from "xlsx";

/**
 * Importação de movimentos bancários para a contabilidade Microdigital.
 *
 * Entrada (Excel de origem, 1 linha por movimento, sem cabeçalho obrigatório):
 *   Formato 6 colunas (conforme anexo):
 *     A: Data | B: Descritivo | C: Débito | D: Crédito | E: Conta a Débito | F: Conta a Crédito
 *   Formato 7 colunas (com saldo):
 *     A: Data | B: Descrição | C: Débito | D: Crédito | E: Saldo (ignorado) | F: Conta a Débito | G: Conta a Crédito
 *
 * Saída: ficheiro .xls no formato exato aceite pelo Microdigital (folha "dia332019010269"),
 * com cada movimento desdobrado em 2 linhas balanceadas (débito / crédito) e numeração
 * Diário+Mês+Sequência (ex: 901001, 901002 … 902001).
 */

export interface BankImportConfig {
  diario: number;
  descritivo: number;
}

export interface BankMovement {
  sourceRow: number; // linha no Excel original (1-based)
  year: number;
  month: number;
  day: number;
  description: string;
  amount: number;
  contaDebito: string | number;
  contaCredito: string | number;
}

export interface BankParseIssue {
  sourceRow: number;
  message: string;
}

export interface ImportLine {
  movementIndex: number;
  numero: number; // NINTERNO / CDOCUMENTO
  year: number;
  month: number;
  day: number;
  conta: string | number;
  debito: number;
  credito: number;
  description: string;
}

export const MICRODIGITAL_SHEET_NAME = "dia332019010269";
export const MICRODIGITAL_FILE_NAME = `${MICRODIGITAL_SHEET_NAME}.xls`;

export const MICRODIGITAL_HEADERS = [
  "'CDIARIO",
  "'NDIA",
  "'NMES",
  "'NANO",
  "'NINTERNO",
  "'CDOCUMENTO",
  "'CCONTA",
  "'NDEBITO",
  "'NCREDITO",
  "'CDESCR",
  "'CDESCRITIVO",
  "'CTIPODESCR",
  "'CCONTRIBUINTE",
  "'CPAIS",
  "'CINTRA",
  "'CUTI",
  "'LIVA",
  "'NDIAF",
  "'NMESF",
  "'NANOF",
];

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** Converte valores como 30152.22, "30 152,22 €", "-  €", "-7,99 €" ou "1.234,56" em número. */
export function parseBankAmount(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v)
    .replace(/[€\s\u00a0\u202f]/g, "")
    .trim();
  if (!s || s === "-" || s === "–" || s === "—" || /^[-–—]+$/.test(s)) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Converte datas (texto dd/mm/aaaa, dd-mm-aaaa, ISO, Date ou nº de série Excel) em {year, month, day}. */
export function parseBankDate(v: unknown): { year: number; month: number; day: number } | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    const h = v.getUTCHours();
    if (h === 0 && v.getUTCMinutes() === 0) {
      return { year: v.getUTCFullYear(), month: v.getUTCMonth() + 1, day: v.getUTCDate() };
    }
    return { year: v.getFullYear(), month: v.getMonth() + 1, day: v.getDate() };
  }

  if (typeof v === "number") {
    if (v < 1 || v > 2958465) return null;
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return null;
    return { year: p.y, month: p.m, day: p.d };
  }

  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return validDate(year, parseInt(m[2], 10), parseInt(m[1], 10));
  }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) {
    return validDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }
  return null;
}

function validDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  return { year, month, day };
}

/** Mantém a conta numérica (como no ficheiro Microdigital) quando só tem dígitos. */
export function parseAccount(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === "-" || s === "–" || s === "—") return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (typeof v === "number") return v;
  return s;
}

export interface ColumnMapping {
  dateCol: number;
  descCol: number;
  debitCol: number;
  creditCol: number;
  contaDebCol: number;
  contaCredCol: number;
}

/**
 * Deteta o layout de colunas do Excel:
 * - 6 colunas (conforme anexo): A: Data | B: Descritivo | C: Débito | D: Crédito | E: Conta Débito | F: Conta Crédito
 * - 7 colunas (com saldo): A: Data | B: Descrição | C: Débito | D: Crédito | E: Saldo | F: Conta Débito | G: Conta Crédito
 * Ou através de cabeçalhos identificados na folha.
 */
export function detectColumnMapping(rows: unknown[][]): ColumnMapping {
  // 1. Verificar se existe uma linha de cabeçalho explicativa nas primeiras linhas
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;
    if (parseBankDate(row[0])) continue; // Linha de dados, não é cabeçalho

    let dateCol = -1;
    let descCol = -1;
    let debitCol = -1;
    let creditCol = -1;
    let contaDebCol = -1;
    let contaCredCol = -1;

    row.forEach((cell, idx) => {
      const s = String(cell ?? "").trim().toLowerCase();
      if (!s) return;
      if (/conta.*d[eé]b|c\.?\s*d[eé]b|cta.*d[eé]b/i.test(s)) {
        contaDebCol = idx;
      } else if (/conta.*cr[eé]d|c\.?\s*cr[eé]d|cta.*cr[eé]d/i.test(s)) {
        contaCredCol = idx;
      } else if (/d[eé]bito|sa[ií]da/i.test(s)) {
        debitCol = idx;
      } else if (/cr[eé]dito|entrada/i.test(s)) {
        creditCol = idx;
      } else if (/data|date/i.test(s)) {
        if (dateCol === -1) dateCol = idx;
      } else if (/descri|hist[oó]rico|movimento/i.test(s)) {
        if (descCol === -1) descCol = idx;
      }
    });

    if (contaDebCol !== -1 && contaCredCol !== -1) {
      return {
        dateCol: dateCol !== -1 ? dateCol : 0,
        descCol: descCol !== -1 ? descCol : 1,
        debitCol: debitCol !== -1 ? debitCol : 2,
        creditCol: creditCol !== -1 ? creditCol : 3,
        contaDebCol,
        contaCredCol,
      };
    }
  }

  // 2. Sem cabeçalhos explícitos: inspecionar as linhas com dados
  let votes6 = 0; // Col E (idx 4) = contaDeb, Col F (idx 5) = contaCred (como no anexo do utilizador)
  let votes7 = 0; // Col F (idx 5) = contaDeb, Col G (idx 6) = contaCred (formato com saldo)

  for (const row of rows) {
    if (!row || !Array.isArray(row)) continue;
    if (!parseBankDate(row[0])) continue;

    const acc4 = parseAccount(row[4]);
    const acc5 = parseAccount(row[5]);
    const acc6 = parseAccount(row[6]);

    if (acc6 !== null && acc5 !== null) {
      votes7++;
    } else if (acc5 !== null && acc4 !== null) {
      votes6++;
    }
  }

  // Por defeito, dá prioridade ao formato do anexo (6 colunas: E=Conta Débito, F=Conta Crédito)
  if (votes7 > votes6) {
    return { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, contaDebCol: 5, contaCredCol: 6 };
  }

  return { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, contaDebCol: 4, contaCredCol: 5 };
}

/**
 * Lê as linhas do Excel de origem (array de arrays) e devolve os movimentos válidos
 * e os problemas encontrados. Linhas sem data válida (cabeçalhos, vazias) são ignoradas.
 */
export function parseBankRows(rows: unknown[][]): {
  movements: BankMovement[];
  issues: BankParseIssue[];
} {
  const movements: BankMovement[] = [];
  const issues: BankParseIssue[] = [];
  const mapping = detectColumnMapping(rows);

  rows.forEach((row, idx) => {
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const sourceRow = idx + 1;
    const date = parseBankDate(row[mapping.dateCol]);
    if (!date) {
      // Primeira linha com texto é tratada como cabeçalho, sem aviso
      if (idx > 0) issues.push({ sourceRow, message: `Data inválida ("${row[mapping.dateCol] ?? ""}") — linha ignorada.` });
      return;
    }

    const description = String(row[mapping.descCol] ?? "").trim();
    const debit = Math.abs(parseBankAmount(row[mapping.debitCol]));
    const credit = mapping.creditCol >= 0 ? Math.abs(parseBankAmount(row[mapping.creditCol])) : 0;
    // O valor do movimento é o montante movimentado (débito ou crédito)
    const amount = Math.round((debit > 0 ? debit : credit) * 100) / 100;

    // Contas com base no mapeamento detetado, com fallback resiliente por linha
    let contaDebito = parseAccount(row[mapping.contaDebCol]);
    let contaCredito = parseAccount(row[mapping.contaCredCol]);

    if ((contaDebito === null || contaCredito === null) && mapping.contaDebCol === 4) {
      const cd5 = parseAccount(row[5]);
      const cc6 = parseAccount(row[6]);
      if (cd5 !== null && cc6 !== null) {
        contaDebito = cd5;
        contaCredito = cc6;
      }
    } else if ((contaDebito === null || contaCredito === null) && mapping.contaDebCol === 5) {
      const cd4 = parseAccount(row[4]);
      const cc5 = parseAccount(row[5]);
      if (cd4 !== null && cc5 !== null) {
        contaDebito = cd4;
        contaCredito = cc5;
      }
    }

    if (amount <= 0) {
      issues.push({ sourceRow, message: "Movimento sem valor — linha ignorada." });
      return;
    }
    if (contaDebito === null || contaCredito === null) {
      issues.push({
        sourceRow,
        message: `Falta a conta a ${contaDebito === null ? "débito" : "crédito"} — linha ignorada.`,
      });
      return;
    }

    movements.push({ sourceRow, ...date, description, amount, contaDebito, contaCredito });
  });

  return { movements, issues };
}

/**
 * Ordena por data, numera por mês (Diário + MM + 001...) e desdobra cada movimento
 * em 2 linhas balanceadas.
 */
export function buildImportLines(movements: BankMovement[], config: BankImportConfig): ImportLine[] {
  const sorted = movements
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ka = a.m.year * 10000 + a.m.month * 100 + a.m.day;
      const kb = b.m.year * 10000 + b.m.month * 100 + b.m.day;
      return ka - kb || a.i - b.i;
    })
    .map((x) => x.m);

  const counters = new Map<string, number>();
  const lines: ImportLine[] = [];

  sorted.forEach((mv, movementIndex) => {
    const key = `${mv.year}-${mv.month}`;
    const seq = (counters.get(key) || 0) + 1;
    counters.set(key, seq);
    const numero = Number(`${config.diario}${pad(mv.month, 2)}${pad(seq, 3)}`);
    const base = { movementIndex, numero, year: mv.year, month: mv.month, day: mv.day, description: mv.description };
    lines.push({ ...base, conta: mv.contaDebito, debito: mv.amount, credito: 0 });
    lines.push({ ...base, conta: mv.contaCredito, debito: 0, credito: mv.amount });
  });

  return lines;
}

/** Linhas no formato exato das colunas Microdigital. */
export function toMicrodigitalRows(lines: ImportLine[], config: BankImportConfig): (string | number)[][] {
  return lines.map((l) => [
    config.diario,
    l.day,
    l.month,
    l.year,
    l.numero,
    l.numero,
    l.conta,
    l.debito,
    l.credito,
    config.descritivo,
    l.description,
    "",
    "",
    "",
    "",
    "",
    0,
    l.day,
    l.month,
    l.year,
  ]);
}

/** Constrói o livro .xls com a folha única de dados ("dia332019010269"). */
export function buildMicrodigitalWorkbook(lines: ImportLine[], config: BankImportConfig): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Apenas a folha que tem valores, sem mais nenhuma folha
  const wsData = XLSX.utils.aoa_to_sheet([MICRODIGITAL_HEADERS, ...toMicrodigitalRows(lines, config)]);
  wsData["!cols"] = [5, 5, 6, 5, 10, 13, 8, 10, 10, 8, 32, 12, 15, 6, 7, 5, 5, 6, 7, 7].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsData, MICRODIGITAL_SHEET_NAME);

  return wb;
}

/** Gera e descarrega o ficheiro .xls (BIFF8) pronto a importar. */
export function downloadMicrodigitalFile(lines: ImportLine[], config: BankImportConfig, fileName = MICRODIGITAL_FILE_NAME) {
  const wb = buildMicrodigitalWorkbook(lines, config);
  const buffer = XLSX.write(wb, { bookType: "xls", type: "array" });
  const blob = new Blob([buffer], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  // Não remover de imediato: o Chrome pode perder o nome do ficheiro (gravando como UUID)
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/** Lê o ficheiro Excel de origem (primeira folha) como array de arrays. */
export async function readBankExcel(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}
