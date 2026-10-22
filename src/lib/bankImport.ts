import * as XLSX from "xlsx";

/**
 * Importação de movimentos bancários para a contabilidade Microdigital.
 *
 * Entrada (Excel de origem, 1 linha por movimento, sem cabeçalho obrigatório):
 *   A: Data | B: Descrição | C: Valor a Débito | D: Valor a Crédito | E: Saldo (ignorado)
 *   F: Conta a Débito | G: Conta a Crédito
 *
 * Saída: ficheiro .xls no formato exato aceite pelo Microdigital (folha "dia332019010269"
 * + folha oculta "Activex" com os metadados de formato), com cada movimento desdobrado
 * em 2 linhas balanceadas (débito / crédito) e numeração Diário+Mês+Sequência (ex: 901001).
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
  "CDIARIO",
  "NDIA",
  "NMES",
  "NANO",
  "NINTERNO",
  "CDOCUMENTO",
  "CCONTA",
  "NDEBITO",
  "NCREDITO",
  "CDESCR",
  "CDESCRITIVO",
  "CTIPODESCR",
  "CCONTRIBUINTE",
  "CPAIS",
  "CINTRA",
  "CUTI",
  "LIVA",
  "NDIAF",
  "NMESF",
  "NANOF",
];

// Formatos por coluna exigidos pela folha oculta "Activex" do modelo Microdigital
const ACTIVEX_FORMATS: Array<[string, string, string]> = [
  ["A1", "#####0", "2"],
  ["B1", "#####0", "2"],
  ["C1", "#####0", "2"],
  ["D1", "#####0", "2"],
  ["E1", "#####0", "2"],
  ["F1", "#####0", "0"],
  ["G1", "#####0", "0"],
  ["H1", "#,##0.00", "2"],
  ["I1", "#,##0.00", "2"],
  ["J1", "#####0", "2"],
  ["K1", "@", "0"],
  ["L1", "@", "0"],
  ["M1", "@", "0"],
  ["N1", "@", "0"],
  ["O1", "@", "0"],
  ["P1", "@", "0"],
  ["Q1", "#####0", "0"],
  ["R1", "#####0", "2"],
  ["S1", "#####0", "2"],
  ["T1", "#####0", "2"],
];

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** Converte valores como 30152.22, "30 152,22 €", "-  €" ou "1.234,56" em número. */
export function parseBankAmount(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v)
    .replace(/[€\s\u00a0\u202f]/g, "")
    .trim();
  if (!s || s === "-") return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Converte datas (texto dd/mm/aaaa, ISO, Date ou nº de série Excel) em {year, month, day}. */
export function parseBankDate(v: unknown): { year: number; month: number; day: number } | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
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
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
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
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (typeof v === "number") return v;
  return s;
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

  rows.forEach((row, idx) => {
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const sourceRow = idx + 1;
    const date = parseBankDate(row[0]);
    if (!date) {
      // Primeira linha com texto é tratada como cabeçalho, sem aviso
      if (idx > 0) issues.push({ sourceRow, message: `Data inválida ("${row[0] ?? ""}") — linha ignorada.` });
      return;
    }

    const description = String(row[1] ?? "").trim();
    const debit = Math.abs(parseBankAmount(row[2]));
    const credit = Math.abs(parseBankAmount(row[3]));
    // Regra: o valor vai sempre para o débito da conta a débito; a coluna E (saldo) é ignorada
    const amount = Math.round((debit > 0 ? debit : credit) * 100) / 100;
    const contaDebito = parseAccount(row[5]);
    const contaCredito = parseAccount(row[6]);

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

/** Constrói o livro .xls idêntico ao modelo de importação Microdigital. */
export function buildMicrodigitalWorkbook(lines: ImportLine[], config: BankImportConfig): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Folha oculta "Activex" (metadados do modelo Microdigital)
  const activex: (string | number | null)[][] = Array.from({ length: 59 }, () => [null, null, null, null]);
  activex[0] = ["B", null, null, null];
  activex[1] = [MICRODIGITAL_SHEET_NAME, "40", "59", 0];
  activex[3] = ["  de 30-12-1899", null, null, null];
  activex[5] = ["  Data de execução: 30-12-1899", null, null, null];
  ACTIVEX_FORMATS.forEach((f, i) => {
    activex[39 + i] = [f[0], f[1], f[2], null];
  });
  const wsActivex = XLSX.utils.aoa_to_sheet(activex);
  XLSX.utils.book_append_sheet(wb, wsActivex, "Activex");

  // Folha de dados
  const wsData = XLSX.utils.aoa_to_sheet([MICRODIGITAL_HEADERS, ...toMicrodigitalRows(lines, config)]);
  wsData["!cols"] = [5, 5, 6, 5, 10, 13, 8, 10, 10, 8, 32, 12, 15, 6, 7, 5, 5, 6, 7, 7].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsData, MICRODIGITAL_SHEET_NAME);

  wb.Workbook = {
    Sheets: [
      { name: "Activex", Hidden: 1 },
      { name: MICRODIGITAL_SHEET_NAME, Hidden: 0 },
    ],
  };
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
