/**
 * Módulo de Lógica Pura de Reconciliação de Faturas
 * Interconta - Excel ("A – Faturas fornecedor") vs Contabilidade em PDF ("B – Contabilidade")
 * 
 * NOTA CRÍTICA: Todos os cálculos financeiros são processados em cêntimos inteiros (integer cents)
 * para garantir precisão absoluta e evitar erros de arredondamento inerentes a IEEE 754 floats.
 */

export interface InvoiceItem {
  id: string;
  supplierRaw: string;
  supplierNormalized: string;
  nif?: string;
  documentNumber: string;
  internalDocNumber?: string; // Nº Interno (lançamento na contabilidade)
  date: string; // Formato YYYY-MM-DD
  amount: number; // Em euros (ex: 123.45)
  amountCents: number; // Em cêntimos (ex: 12345)
  baseAmount?: number; // Base tributável sem IVA (ex: 450.00)
  baseAmountCents?: number; // Base em cêntimos (ex: 45000)
  source: "excel" | "pdf";
  confidence?: number; // 0 a 1 (apenas para extração de PDF)
  lowConfidenceFields?: string[];
  pdfFileName?: string;
  pageNumber?: number;
  excelRowIndex?: number; // Índice da linha original no ficheiro Excel
  isReconciled?: boolean; // Se esta fatura específica foi reconciliada
}

export type SupplierReconciliationStatus =
  | "reconciliado"
  | "parcialmente_reconciliado"
  | "nao_reconciliado";

export interface DayDiscrepancy {
  date: string; // YYYY-MM-DD
  totalExcel: number;
  totalPdf: number;
  difference: number;
  totalExcelCents: number;
  totalPdfCents: number;
  differenceCents: number;
  excelInvoices: InvoiceItem[];
  pdfInvoices: InvoiceItem[];
  status: "correto" | "diferenca" | "apenas_excel" | "apenas_pdf";
}

export interface SupplierReconciliationResult {
  supplierKey: string;
  supplierName: string;
  nif?: string;
  status: SupplierReconciliationStatus;
  totalExcel: number;
  totalPdf: number;
  difference: number; // totalExcel - totalPdf
  totalExcelCents: number;
  totalPdfCents: number;
  differenceCents: number;
  excelInvoicesCount: number;
  pdfInvoicesCount: number;
  dayDiscrepancies: DayDiscrepancy[]; // Dias com divergência ou dias só num dos lados
  correctDaysCount: number;
  discrepantDaysCount: number;
  orphanExcelInvoices: InvoiceItem[]; // Faturas em dias sem qualquer movimento no PDF
  orphanPdfInvoices: InvoiceItem[]; // Faturas em dias sem qualquer movimento no Excel
  allExcelInvoices: InvoiceItem[];
  allPdfInvoices: InvoiceItem[];
}

export interface GlobalReconciliationSummary {
  totalSuppliers: number;
  reconciledCount: number;
  partiallyReconciledCount: number;
  notReconciledCount: number;
  totalExcelAmount: number;
  totalPdfAmount: number;
  totalDifference: number;
  suppliers: SupplierReconciliationResult[];
}

/**
 * Converte valor em euros para cêntimos inteiros com arredondamento seguro.
 */
export function toCents(euros: number): number {
  if (isNaN(euros) || !isFinite(euros)) return 0;
  return Math.round(euros * 100);
}

/**
 * Converte cêntimos inteiros para euros formatados (duas casas decimais).
 */
export function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Normaliza o nome do fornecedor removendo acentos, caracteres especiais,
 * espaços múltiplos e sufixos societários comuns em Portugal (Lda, S.A., etc.)
 */
export function normalizeSupplierName(name: string): string {
  if (!name) return "";

  let cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toUpperCase()
    .trim();

  // Substituir pontuações comuns por espaços
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ");

  // Remover formas societárias portuguesas e espanholas frequentes
  const suffixes = [
    /\bSOCIEDADE UNIPESSOAL\b/g,
    /\bUNIPESSOAL LDA\b/g,
    /\bUNIPESSOAL\b/g,
    /\bSOCIEDADE ANONIMA\b/g,
    /\bLIMITADA\b/g,
    /\bLDA\b/g,
    /\bSA\b/g,
    /\bS A\b/g,
    /\bEIRL\b/g,
    /\bSL\b/g,
    /\bS L\b/g,
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, " ");
  }

  // Normalizar espaços múltiplos
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

/**
 * Valida e normaliza um NIF português (9 dígitos numéricos) ou NIF comunitário/estrangeiro
 */
export function extractAndValidateNif(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  // Se for uma data, não é NIF
  if (/^\d{1,4}[\/\.-]\d{1,2}[\/\.-]\d{2,4}$/.test(trimmed)) {
    return undefined;
  }

  // NIF português padrão: 9 dígitos numéricos
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 9) {
    return digits;
  }

  // NIF ou VAT intracomunitário/estrangeiro em maiúsculas (ex: ESA08820953, A58195611, B86142809)
  const cleaned = trimmed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // Se for puramente números, só é válido com 9 dígitos
  if (/^\d+$/.test(cleaned)) {
    return cleaned.length === 9 ? cleaned : undefined;
  }

  if (cleaned.length >= 8 && cleaned.length <= 14) {
    return cleaned;
  }

  return undefined;
}

/**
 * Cria a chave identificadora do fornecedor para junção.
 * Se houver NIF válido, tem SEMPRE prioridade sobre o nome.
 */
export function buildSupplierKey(supplierName: string, nif?: string): string {
  const validNif = extractAndValidateNif(nif);
  if (validNif) {
    return `NIF:${validNif}`;
  }
  const normalized = normalizeSupplierName(supplierName);
  return `NAME:${normalized}`;
}

/**
 * Limpa termos descritivos de contabilidade e sufixos ATCUD de um documento
 */
export function cleanDocForMatching(doc?: string): string {
  if (!doc) return "";
  let d = String(doc).trim();
  // Remover sufixo ATCUD se presente (ex: "FR U003/147002 / JFK87J4D-147002" -> "FR U003/147002")
  d = d.split(/\s+\/\s+/)[0].trim();
  // Remover termos descritivos de contabilidade (ex: "4388 V/ Factura" -> "4388", "116 V/ Nota Credito" -> "116")
  d = d.replace(/\s+V\/\s*.*$/i, "").trim();
  return d;
}

/**
 * Extrai os números/dígitos significativos de um documento para comparação.
 * Ex: "FT D2-A/14388" -> { allDigits: ["2", "14388"], lastDigits: "14388", intVal: 14388 }
 * Ex: "4388 V/ Factura" -> { allDigits: ["4388"], lastDigits: "4388", intVal: 4388 }
 * Ex: "FRB FRB2026/667" -> { allDigits: ["2026", "667"], lastDigits: "667", intVal: 667 }
 */
export function extractDocDigits(doc?: string): { allDigits: string[]; lastDigits: string; intVal?: number } {
  const cleaned = cleanDocForMatching(doc);
  const matches = cleaned.match(/\d+/g) || [];
  if (matches.length === 0) {
    return { allDigits: [], lastDigits: "", intVal: undefined };
  }
  const lastDigits = matches[matches.length - 1];
  const intVal = parseInt(lastDigits, 10);
  return { allDigits: matches, lastDigits, intVal: isNaN(intVal) ? undefined : intVal };
}

/**
 * Verifica se dois números de documento correspondem:
 * 1. Igualdade direta após limpeza (ignorando case e espaços)
 * 2. Um contém o outro (apenas com tamanho >= 2 para evitar falsos positivos com dígitos isolados)
 * 3. Mesmo valor inteiro final (ex: "00116" vs "116", ou "054" vs "54", ou "667" vs "667")
 * 4. Sufixo numérico idêntico (ex: "14388" termina em "4388", ou vice-versa, com min. 2 dígitos)
 */
export function docNumbersMatch(docA?: string, docB?: string): boolean {
  if (!docA || !docB) return false;

  const cleanA = cleanDocForMatching(docA).toUpperCase().replace(/\s+/g, "");
  const cleanB = cleanDocForMatching(docB).toUpperCase().replace(/\s+/g, "");

  if (!cleanA || !cleanB) return false;

  // 1. Igualdade direta
  if (cleanA === cleanB) return true;

  // 2. Um contém o outro (apenas se tiver comprimento relevante >= 2)
  if (cleanB.length >= 2 && cleanA.includes(cleanB)) return true;
  if (cleanA.length >= 2 && cleanB.includes(cleanA)) return true;

  const digitsA = extractDocDigits(docA);
  const digitsB = extractDocDigits(docB);

  if (!digitsA.lastDigits || !digitsB.lastDigits) return false;

  // 3. Mesmo valor numérico inteiro (ex: "00116" vs "116", "054" vs "54", "667" vs "667")
  if (digitsA.intVal !== undefined && digitsB.intVal !== undefined && digitsA.intVal === digitsB.intVal) {
    return true;
  }

  const dA = digitsA.lastDigits;
  const dB = digitsB.lastDigits;

  // 4. Últimos dígitos idênticos como string
  if (dA === dB) return true;

  // 5. Se os últimos números forem iguais (ex: 14388 termina em 4388, ou vice-versa)
  // Requer pelo menos 2 dígitos no sufixo para evitar falsos positivos com números de 1 dígito
  if (dA.length >= 2 && dB.length >= 2) {
    if (dA.endsWith(dB) || dB.endsWith(dA)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se duas datas pertencem ao mesmo mês ou estão próximas (até maxDaysDiff dias).
 * Ex: "2026-08-11" e "2026-08-12" -> mesmo mês (2026-08) -> true.
 */
export function isSameMonthOrNear(dateA: string, dateB: string, maxDaysDiff: number = 35): boolean {
  if (!dateA || !dateB) return false;

  // Mesmo ano e mês (ex: "2026-08" === "2026-08")
  if (dateA.length >= 7 && dateB.length >= 7 && dateA.slice(0, 7) === dateB.slice(0, 7)) {
    return true;
  }

  // Ou proximidade temporal até maxDaysDiff dias
  const [y1, m1, d1] = dateA.split("-").map((n) => parseInt(n, 10));
  const [y2, m2, d2] = dateB.split("-").map((n) => parseInt(n, 10));
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return false;

  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.abs(t1 - t2) / 86400000;
  return diffDays <= maxDaysDiff;
}

/**
 * LÓGICA PRINCIPAL DE RECONCILIAÇÃO POR FORNECEDOR
 * 
 * Segue os passos definidos:
 * 1. PASSO 1 – Total: soma Excel vs soma PDFs.
 *    Se diferença <= 1 cêntimo (tolerância 0,01 €), fica RECONCILIADO a 100%.
 * 2. PASSO 2 – Se totais diferentes:
 *    Agrupa por dia (YYYY-MM-DD). Compara totais do dia:
 *    - Totais iguais -> dia CORRETO.
 *    - Totais diferentes -> Tenta correspondência 1-a-1 por Documento (ou sufixo) + Valor (ou Base)
 *                           e depois por valor exato do dia.
 * 3. PASSO 2.5 – Multi-Data / Mesmo Mês:
 *    Para as faturas que continuam por reconciliar: se forem do mesmo NIF, mesmo mês,
 *    valor igual (Total ou Base Tributável) e número do documento igual ou com os
 *    últimos números/dígitos iguais -> RECONCILIADO (pintado a verde).
 * 4. Classificação final:
 *    - Reconciliado (todas as faturas reconciliadas)
 *    - Parcialmente Reconciliado (algumas reconciliadas)
 *    - Não Reconciliado (nenhuma reconciliada)
 */
export function reconcileSupplier(
  supplierKey: string,
  supplierDisplayName: string,
  excelInvoices: InvoiceItem[],
  pdfInvoices: InvoiceItem[],
  nif?: string,
  centsTolerance: number = 1 // 1 cêntimo = 0.01 €
): SupplierReconciliationResult {
  // Somatórios em cêntimos inteiros
  const totalExcelCents = excelInvoices.reduce((sum, inv) => sum + inv.amountCents, 0);
  const totalPdfCents = pdfInvoices.reduce((sum, inv) => sum + inv.amountCents, 0);
  const diffCents = totalExcelCents - totalPdfCents;

  const totalExcel = fromCents(totalExcelCents);
  const totalPdf = fromCents(totalPdfCents);
  const difference = fromCents(diffCents);

  // PASSO 1: Totais globais iguais dentro da tolerância de cêntimos
  if (Math.abs(diffCents) <= centsTolerance && excelInvoices.length > 0 && pdfInvoices.length > 0) {
    excelInvoices.forEach((inv) => { inv.isReconciled = true; });
    pdfInvoices.forEach((inv) => { inv.isReconciled = true; });
    return {
      supplierKey,
      supplierName: supplierDisplayName,
      nif,
      status: "reconciliado",
      totalExcel,
      totalPdf,
      difference: 0,
      totalExcelCents,
      totalPdfCents,
      differenceCents: 0,
      excelInvoicesCount: excelInvoices.length,
      pdfInvoicesCount: pdfInvoices.length,
      dayDiscrepancies: [],
      correctDaysCount: Math.max(excelInvoices.length, pdfInvoices.length),
      discrepantDaysCount: 0,
      orphanExcelInvoices: [],
      orphanPdfInvoices: [],
      allExcelInvoices: excelInvoices,
      allPdfInvoices: pdfInvoices,
    };
  }

  // PASSO 2: Agrupar por dia (YYYY-MM-DD)
  const excelByDate = new Map<string, InvoiceItem[]>();
  for (const inv of excelInvoices) {
    const list = excelByDate.get(inv.date) || [];
    list.push(inv);
    excelByDate.set(inv.date, list);
  }

  const pdfByDate = new Map<string, InvoiceItem[]>();
  for (const inv of pdfInvoices) {
    const list = pdfByDate.get(inv.date) || [];
    list.push(inv);
    pdfByDate.set(inv.date, list);
  }

  const allDates = Array.from(new Set([...excelByDate.keys(), ...pdfByDate.keys()])).sort();

  const dayDiscrepancies: DayDiscrepancy[] = [];
  const usedPdfIds = new Set<string>();

  for (const date of allDates) {
    const dayExcelInvs = excelByDate.get(date) || [];
    const dayPdfInvs = pdfByDate.get(date) || [];

    const dayExcelCents = dayExcelInvs.reduce((sum, inv) => sum + inv.amountCents, 0);
    const dayPdfCents = dayPdfInvs.reduce((sum, inv) => sum + inv.amountCents, 0);
    const dayDiffCents = dayExcelCents - dayPdfCents;

    if (Math.abs(dayDiffCents) <= centsTolerance && dayExcelInvs.length > 0 && dayPdfInvs.length > 0) {
      // Dia CORRETO pelo somatório total do dia
      dayExcelInvs.forEach((inv) => { inv.isReconciled = true; });
      dayPdfInvs.forEach((inv) => {
        inv.isReconciled = true;
        usedPdfIds.add(inv.id);
      });
    } else {
      // Tentar correspondências 1-a-1 dentro deste dia
      // 1. Por documento coincidente + (montante total OU base tributável)
      for (const eInv of dayExcelInvs) {
        if (eInv.isReconciled) continue;
        const match = dayPdfInvs.find(
          (pInv) =>
            !usedPdfIds.has(pInv.id) &&
            !pInv.isReconciled &&
            docNumbersMatch(eInv.documentNumber, pInv.documentNumber) &&
            (
              Math.abs(pInv.amountCents - eInv.amountCents) <= centsTolerance ||
              (eInv.baseAmountCents !== undefined && Math.abs(pInv.amountCents - eInv.baseAmountCents) <= centsTolerance)
            )
        );
        if (match) {
          eInv.isReconciled = true;
          match.isReconciled = true;
          usedPdfIds.add(match.id);
        }
      }

      // 2. Por montante total exato dentro do dia
      for (const eInv of dayExcelInvs) {
        if (eInv.isReconciled) continue;
        const match = dayPdfInvs.find(
          (pInv) =>
            !usedPdfIds.has(pInv.id) &&
            !pInv.isReconciled &&
            Math.abs(pInv.amountCents - eInv.amountCents) <= centsTolerance
        );
        if (match) {
          eInv.isReconciled = true;
          match.isReconciled = true;
          usedPdfIds.add(match.id);
        }
      }

      dayDiscrepancies.push({
        date,
        totalExcel: fromCents(dayExcelCents),
        totalPdf: fromCents(dayPdfCents),
        difference: fromCents(dayDiffCents),
        totalExcelCents: dayExcelCents,
        totalPdfCents: dayPdfCents,
        differenceCents: dayDiffCents,
        excelInvoices: dayExcelInvs,
        pdfInvoices: dayPdfInvs,
        status: dayExcelInvs.length > 0 && dayPdfInvs.length === 0
          ? "apenas_excel"
          : dayPdfInvs.length > 0 && dayExcelInvs.length === 0
          ? "apenas_pdf"
          : "diferenca",
      });
    }
  }

  // PASSO 2.5: Reconciliação Multi-Data / Mesmo Mês por Documento e Valor (ou Base Tributável)
  // Requisito do utilizador: "se for do mesmo nif mesmo mes e valor igual e podes ver tb se o numero do documento seja igual ou os ultimos numeros sejam iguais mete a verde (reconciliado)"
  for (const eInv of excelInvoices) {
    if (eInv.isReconciled) continue;

    const match = pdfInvoices.find((pInv) => {
      if (pInv.isReconciled || usedPdfIds.has(pInv.id)) return false;

      // 1. Mesmo mês ou intervalo temporal próximo (até 35 dias)
      if (!isSameMonthOrNear(eInv.date, pInv.date, 35)) return false;

      // 2. Valor igual (compara com Total ou com Base Tributável)
      const matchesAmount = Math.abs(eInv.amountCents - pInv.amountCents) <= centsTolerance;
      const matchesBase =
        eInv.baseAmountCents !== undefined &&
        Math.abs(eInv.baseAmountCents - pInv.amountCents) <= centsTolerance;

      if (!matchesAmount && !matchesBase) return false;

      // 3. Número do documento igual ou últimos números/dígitos iguais
      return docNumbersMatch(eInv.documentNumber, pInv.documentNumber);
    });

    if (match) {
      eInv.isReconciled = true;
      match.isReconciled = true;
      usedPdfIds.add(match.id);
    }
  }

  // Marcar explicitamente as restantes faturas como não reconciliadas
  excelInvoices.forEach((inv) => {
    if (inv.isReconciled === undefined) inv.isReconciled = false;
  });
  pdfInvoices.forEach((inv) => {
    if (inv.isReconciled === undefined) inv.isReconciled = false;
  });

  const orphanExcelInvoices = excelInvoices.filter((inv) => !inv.isReconciled);
  const orphanPdfInvoices = pdfInvoices.filter((inv) => !inv.isReconciled);

  // Filtrar discrepâncias diárias: manter apenas os dias onde ainda existem faturas não reconciliadas
  const activeDayDiscrepancies = dayDiscrepancies.filter(
    (d) => d.excelInvoices.some((inv) => !inv.isReconciled) || d.pdfInvoices.some((inv) => !inv.isReconciled)
  );

  const correctDaysCount = allDates.length - activeDayDiscrepancies.length;
  const discrepantDaysCount = activeDayDiscrepancies.length;

  const allExcelReconciled = excelInvoices.length > 0 && excelInvoices.every((i) => i.isReconciled);
  const allPdfReconciled = pdfInvoices.length > 0 && pdfInvoices.every((i) => i.isReconciled);
  const anyReconciled = excelInvoices.some((i) => i.isReconciled) || pdfInvoices.some((i) => i.isReconciled);

  let finalStatus: SupplierReconciliationStatus = "nao_reconciliado";
  if (allExcelReconciled && allPdfReconciled) {
    finalStatus = "reconciliado";
  } else if (anyReconciled) {
    finalStatus = "parcialmente_reconciliado";
  }

  return {
    supplierKey,
    supplierName: supplierDisplayName,
    nif,
    status: finalStatus,
    totalExcel,
    totalPdf,
    difference,
    totalExcelCents,
    totalPdfCents,
    differenceCents: diffCents,
    excelInvoicesCount: excelInvoices.length,
    pdfInvoicesCount: pdfInvoices.length,
    dayDiscrepancies: activeDayDiscrepancies,
    correctDaysCount,
    discrepantDaysCount,
    orphanExcelInvoices,
    orphanPdfInvoices,
    allExcelInvoices: excelInvoices,
    allPdfInvoices: pdfInvoices,
  };
}

/**
 * Executa a reconciliação global cruzando todos os dados do Excel e dos PDFs.
 * 
 * @param excelInvoices Lista de faturas lidas do Excel
 * @param pdfInvoices Lista de faturas lidas dos PDFs
 * @param manualSupplierMapping Mapa manual de correspondência: { [chaveExcel]: chavePdf }
 */
export function reconcileAll(
  excelInvoices: InvoiceItem[],
  pdfInvoices: InvoiceItem[],
  manualSupplierMapping: Record<string, string> = {}
): GlobalReconciliationSummary {
  // Mapa de agrupamento: supplierKey -> { name, nif, excelInvs, pdfInvs }
  interface Group {
    key: string;
    displayName: string;
    nif?: string;
    excel: InvoiceItem[];
    pdf: InvoiceItem[];
  }

  const groups = new Map<string, Group>();

  // 1. Agrupar faturas do Excel
  for (const inv of excelInvoices) {
    let key = buildSupplierKey(inv.supplierRaw, inv.nif);
    // Verificar se existe mapeamento manual explícito
    if (manualSupplierMapping[key]) {
      key = manualSupplierMapping[key];
    }

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        displayName: inv.supplierRaw,
        nif: extractAndValidateNif(inv.nif),
        excel: [],
        pdf: [],
      };
      groups.set(key, g);
    }
    g.excel.push(inv);
    if (!g.nif && inv.nif) g.nif = extractAndValidateNif(inv.nif);
  }

  // 2. Agrupar faturas dos PDFs
  for (const inv of pdfInvoices) {
    const key = buildSupplierKey(inv.supplierRaw, inv.nif);

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        displayName: inv.supplierRaw,
        nif: extractAndValidateNif(inv.nif),
        excel: [],
        pdf: [],
      };
      groups.set(key, g);
    }
    g.pdf.push(inv);
    if (!g.nif && inv.nif) g.nif = extractAndValidateNif(inv.nif);
  }

  // 3. Reconciliar fornecedor a fornecedor
  const suppliersResults: SupplierReconciliationResult[] = [];
  let reconciledCount = 0;
  let partiallyReconciledCount = 0;
  let notReconciledCount = 0;
  let totalExcelCentsAll = 0;
  let totalPdfCentsAll = 0;

  for (const group of groups.values()) {
    const result = reconcileSupplier(
      group.key,
      group.displayName,
      group.excel,
      group.pdf,
      group.nif
    );

    suppliersResults.push(result);

    if (result.status === "reconciliado") {
      reconciledCount++;
    } else if (result.status === "parcialmente_reconciliado") {
      partiallyReconciledCount++;
    } else {
      notReconciledCount++;
    }

    totalExcelCentsAll += result.totalExcelCents;
    totalPdfCentsAll += result.totalPdfCents;
  }

  // Ordenar resultados: por defeito, NÃO reconciliados primeiro, depois parcialmente, depois reconciliados
  const statusPriority: Record<SupplierReconciliationStatus, number> = {
    nao_reconciliado: 0,
    parcialmente_reconciliado: 1,
    reconciliado: 2,
  };

  suppliersResults.sort((a, b) => {
    const pDiff = statusPriority[a.status] - statusPriority[b.status];
    if (pDiff !== 0) return pDiff;
    // Se o mesmo status, ordenar alfabeticamente pelo nome
    return a.supplierName.localeCompare(b.supplierName);
  });

  return {
    totalSuppliers: suppliersResults.length,
    reconciledCount,
    partiallyReconciledCount,
    notReconciledCount,
    totalExcelAmount: fromCents(totalExcelCentsAll),
    totalPdfAmount: fromCents(totalPdfCentsAll),
    totalDifference: fromCents(totalExcelCentsAll - totalPdfCentsAll),
    suppliers: suppliersResults,
  };
}
