/**
 * Serviço de Gestão e Versionamento das Tabelas de Retenção na Fonte de IRS em Portugal
 * Suporta persistência na Nuvem (Supabase), LocalStorage e importação de ficheiros oficiais da AT (.csv / .xlsx / texto)
 */

import { supabase } from "./supabase";

export interface IRSBracketRow {
  limit: number;             // Limite superior do escalão em €
  rate: number;              // Taxa marginal em percentagem (ex: 12.5 para 12.5%)
  deductionFixed: number;    // Parcela a abater fixa em €
  dependentDeduction: number;// Parcela a abater por dependente em €
}

export interface IRSTableVersion {
  id: string;
  name: string;
  year: number;
  isCurrent: boolean;
  legalNotice: string;
  minExemptSalary: number;   // Salário mínimo nacional isento (ex: 920€ em 2026)
  mealExemptCard: number;    // Limite diário isento em cartão de refeição (ex: 10.46€)
  mealExemptCash: number;    // Limite diário isento em numerário (ex: 6.15€)
  bracketsTableI: IRSBracketRow[]; // Não casado / Casado 2 titulares
  bracketsTableIV: IRSBracketRow[]; // Casado único titular
  bracketsDeficientes: IRSBracketRow[]; // Sujeitos com deficiência >= 60%
  updatedAt: string;
}

// =========================================================================
// TABELAS OFICIAIS PREDEFINIDAS (VERSÕES HISTÓRICAS E EM VIGOR)
// =========================================================================

export const DEFAULT_VERSIONS: IRSTableVersion[] = [
  {
    id: "2026_oficial",
    name: "2026 - Oficial (Despacho n.º 233-A/2026)",
    year: 2026,
    isCurrent: true,
    legalNotice: "Despacho n.º 233-A/2026, de 6 de janeiro. RMMG de 920 €.",
    minExemptSalary: 920.00,
    mealExemptCard: 10.46,
    mealExemptCash: 6.15,
    bracketsTableI: [
      { limit: 920, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 1042, rate: 12.50, deductionFixed: 89.00, dependentDeduction: 21.43 },
      { limit: 1108, rate: 15.70, deductionFixed: 78.50, dependentDeduction: 21.43 },
      { limit: 1250, rate: 17.50, deductionFixed: 98.40, dependentDeduction: 21.43 },
      { limit: 1450, rate: 21.00, deductionFixed: 142.10, dependentDeduction: 21.43 },
      { limit: 1800, rate: 24.10, deductionFixed: 187.05, dependentDeduction: 21.43 },
      { limit: 2200, rate: 27.50, deductionFixed: 248.25, dependentDeduction: 21.43 },
      { limit: 2800, rate: 31.00, deductionFixed: 325.25, dependentDeduction: 21.43 },
      { limit: 3600, rate: 35.00, deductionFixed: 437.25, dependentDeduction: 21.43 },
      { limit: 4800, rate: 38.00, deductionFixed: 545.25, dependentDeduction: 21.43 },
      { limit: 6500, rate: 41.50, deductionFixed: 713.25, dependentDeduction: 21.43 },
      { limit: 999999, rate: 45.00, deductionFixed: 940.75, dependentDeduction: 21.43 },
    ],
    bracketsTableIV: [
      { limit: 920, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 1200, rate: 10.00, deductionFixed: 75.00, dependentDeduction: 42.86 },
      { limit: 1500, rate: 13.00, deductionFixed: 65.00, dependentDeduction: 42.86 },
      { limit: 1850, rate: 16.50, deductionFixed: 117.50, dependentDeduction: 42.86 },
      { limit: 2300, rate: 21.00, deductionFixed: 200.75, dependentDeduction: 42.86 },
      { limit: 2900, rate: 25.00, deductionFixed: 292.75, dependentDeduction: 42.86 },
      { limit: 3700, rate: 29.50, deductionFixed: 423.25, dependentDeduction: 42.86 },
      { limit: 4900, rate: 34.00, deductionFixed: 589.75, dependentDeduction: 42.86 },
      { limit: 6500, rate: 38.50, deductionFixed: 810.25, dependentDeduction: 42.86 },
      { limit: 999999, rate: 43.00, deductionFixed: 1102.75, dependentDeduction: 42.86 },
    ],
    bracketsDeficientes: [
      { limit: 1450, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 2200, rate: 12.00, deductionFixed: 174.00, dependentDeduction: 28.50 },
      { limit: 3500, rate: 18.00, deductionFixed: 306.00, dependentDeduction: 28.50 },
      { limit: 5000, rate: 24.00, deductionFixed: 516.00, dependentDeduction: 28.50 },
      { limit: 999999, rate: 32.00, deductionFixed: 916.00, dependentDeduction: 28.50 },
    ],
    updatedAt: "2026-01-06",
  },
  {
    id: "2025_pos_agosto",
    name: "2025 - 2.º Semestre (Despacho n.º 8464-A/2025)",
    year: 2025,
    isCurrent: false,
    legalNotice: "Despacho n.º 8464-A/2025, aplicável de agosto a dezembro de 2025.",
    minExemptSalary: 870.00,
    mealExemptCard: 10.20,
    mealExemptCash: 6.00,
    bracketsTableI: [
      { limit: 870, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 964, rate: 13.00, deductionFixed: 125.32, dependentDeduction: 21.43 },
      { limit: 1067, rate: 16.50, deductionFixed: 159.06, dependentDeduction: 21.43 },
      { limit: 1167, rate: 18.00, deductionFixed: 175.07, dependentDeduction: 21.43 },
      { limit: 1373, rate: 22.00, deductionFixed: 221.75, dependentDeduction: 21.43 },
      { limit: 1765, rate: 25.00, deductionFixed: 262.94, dependentDeduction: 21.43 },
      { limit: 2249, rate: 28.50, deductionFixed: 324.72, dependentDeduction: 21.43 },
      { limit: 2850, rate: 32.00, deductionFixed: 403.44, dependentDeduction: 21.43 },
      { limit: 3939, rate: 35.50, deductionFixed: 503.19, dependentDeduction: 21.43 },
      { limit: 5361, rate: 39.00, deductionFixed: 641.06, dependentDeduction: 21.43 },
      { limit: 7460, rate: 42.00, deductionFixed: 801.89, dependentDeduction: 21.43 },
      { limit: 999999, rate: 45.00, deductionFixed: 1025.69, dependentDeduction: 21.43 },
    ],
    bracketsTableIV: [
      { limit: 870, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 1150, rate: 11.00, deductionFixed: 95.70, dependentDeduction: 42.86 },
      { limit: 1450, rate: 14.50, deductionFixed: 136.00, dependentDeduction: 42.86 },
      { limit: 1800, rate: 17.50, deductionFixed: 179.50, dependentDeduction: 42.86 },
      { limit: 2250, rate: 22.00, deductionFixed: 260.50, dependentDeduction: 42.86 },
      { limit: 2850, rate: 26.00, deductionFixed: 350.50, dependentDeduction: 42.86 },
      { limit: 3650, rate: 30.50, deductionFixed: 478.75, dependentDeduction: 42.86 },
      { limit: 4800, rate: 35.00, deductionFixed: 643.00, dependentDeduction: 42.86 },
      { limit: 6400, rate: 39.50, deductionFixed: 859.00, dependentDeduction: 42.86 },
      { limit: 999999, rate: 44.00, deductionFixed: 1147.00, dependentDeduction: 42.86 },
    ],
    bracketsDeficientes: [
      { limit: 1350, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 2100, rate: 12.50, deductionFixed: 168.75, dependentDeduction: 28.50 },
      { limit: 3400, rate: 18.50, deductionFixed: 294.75, dependentDeduction: 28.50 },
      { limit: 4900, rate: 24.50, deductionFixed: 498.75, dependentDeduction: 28.50 },
      { limit: 999999, rate: 33.00, deductionFixed: 915.25, dependentDeduction: 28.50 },
    ],
    updatedAt: "2025-07-22",
  },
  {
    id: "2025_semestre1",
    name: "2025 - 1.º Semestre (Despacho n.º 236-A/2025)",
    year: 2025,
    isCurrent: false,
    legalNotice: "Despacho n.º 236-A/2025, aplicável de janeiro a julho de 2025.",
    minExemptSalary: 870.00,
    mealExemptCard: 10.20,
    mealExemptCash: 6.00,
    bracketsTableI: [
      { limit: 870, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 964, rate: 13.00, deductionFixed: 125.32, dependentDeduction: 21.43 },
      { limit: 1067, rate: 16.50, deductionFixed: 159.06, dependentDeduction: 21.43 },
      { limit: 1167, rate: 18.00, deductionFixed: 175.07, dependentDeduction: 21.43 },
      { limit: 1373, rate: 22.00, deductionFixed: 221.75, dependentDeduction: 21.43 },
      { limit: 1765, rate: 25.00, deductionFixed: 262.94, dependentDeduction: 21.43 },
      { limit: 2249, rate: 29.00, deductionFixed: 333.54, dependentDeduction: 21.43 },
      { limit: 2850, rate: 33.00, deductionFixed: 423.50, dependentDeduction: 21.43 },
      { limit: 3939, rate: 37.00, deductionFixed: 537.50, dependentDeduction: 21.43 },
      { limit: 5361, rate: 41.00, deductionFixed: 694.66, dependentDeduction: 21.43 },
      { limit: 7460, rate: 43.50, deductionFixed: 828.69, dependentDeduction: 21.43 },
      { limit: 999999, rate: 45.00, deductionFixed: 940.69, dependentDeduction: 21.43 },
    ],
    bracketsTableIV: [
      { limit: 870, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 1150, rate: 11.00, deductionFixed: 95.70, dependentDeduction: 42.86 },
      { limit: 1450, rate: 14.50, deductionFixed: 136.00, dependentDeduction: 42.86 },
      { limit: 1800, rate: 18.00, deductionFixed: 186.75, dependentDeduction: 42.86 },
      { limit: 2250, rate: 22.50, deductionFixed: 267.75, dependentDeduction: 42.86 },
      { limit: 2850, rate: 27.00, deductionFixed: 369.00, dependentDeduction: 42.86 },
      { limit: 3650, rate: 31.50, deductionFixed: 497.25, dependentDeduction: 42.86 },
      { limit: 4800, rate: 36.00, deductionFixed: 661.50, dependentDeduction: 42.86 },
      { limit: 6400, rate: 40.50, deductionFixed: 877.50, dependentDeduction: 42.86 },
      { limit: 999999, rate: 45.00, deductionFixed: 1165.50, dependentDeduction: 42.86 },
    ],
    bracketsDeficientes: [
      { limit: 1350, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 2100, rate: 13.00, deductionFixed: 175.50, dependentDeduction: 28.50 },
      { limit: 3400, rate: 19.00, deductionFixed: 301.50, dependentDeduction: 28.50 },
      { limit: 4900, rate: 25.00, deductionFixed: 505.50, dependentDeduction: 28.50 },
      { limit: 999999, rate: 34.00, deductionFixed: 946.50, dependentDeduction: 28.50 },
    ],
    updatedAt: "2025-01-06",
  },
];

const LOCAL_STORAGE_KEY = "interconta_irs_versions_v1";

// =========================================================================
// FUNÇÕES DE CARREGAMENTO E PERSISTÊNCIA (SUPABASE + LOCALSTORAGE)
// =========================================================================

/**
 * Carrega todas as versões disponíveis (tenta do Supabase e faz fallback para localStorage / defaults)
 */
export async function loadIRSTableVersions(): Promise<IRSTableVersion[]> {
  try {
    // 1. Tentar ler da base de dados Supabase (tabela: tabelas_irs)
    const { data, error } = await supabase
      .from("tabelas_irs")
      .select("*")
      .order("year", { ascending: false });

    if (!error && data && data.length > 0) {
      // Converte os dados do Supabase
      const cloudVersions: IRSTableVersion[] = data.map((item: any) => ({
        id: item.id || item.codigo,
        name: item.name || item.nome,
        year: item.year || item.ano,
        isCurrent: Boolean(item.is_current),
        legalNotice: item.legal_notice || item.despacho || "",
        minExemptSalary: Number(item.min_exempt_salary || 920),
        mealExemptCard: Number(item.meal_exempt_card || 10.46),
        mealExemptCash: Number(item.meal_exempt_cash || 6.15),
        bracketsTableI: item.brackets_table_i || item.escaloes_tabela_1 || [],
        bracketsTableIV: item.brackets_table_iv || item.escaloes_tabela_4 || [],
        bracketsDeficientes: item.brackets_deficientes || [],
        updatedAt: item.updated_at || new Date().toISOString(),
      }));

      // Atualiza também no localStorage para cache offline
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudVersions));
      return cloudVersions;
    }
  } catch (err) {
    console.warn("Supabase tabelas_irs não acessível (a usar cache local):", err);
  }

  // 2. Fallback: Ler do localStorage
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Erro a ler cache local:", e);
  }

  // 3. Fallback final: Devolver predefinições oficiais
  return DEFAULT_VERSIONS;
}

/**
 * Guarda uma versão de tabela no Supabase e no localStorage
 */
export async function saveIRSTableVersion(
  version: IRSTableVersion
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Guardar no localStorage
    const currentList = await loadIRSTableVersions();
    const existingIndex = currentList.findIndex((v) => v.id === version.id);
    let updatedList = [...currentList];

    if (existingIndex >= 0) {
      updatedList[existingIndex] = { ...version, updatedAt: new Date().toISOString() };
    } else {
      updatedList.unshift({ ...version, updatedAt: new Date().toISOString() });
    }

    // Se esta for marcada como atual, desmarca as outras
    if (version.isCurrent) {
      updatedList = updatedList.map((v) => ({
        ...v,
        isCurrent: v.id === version.id,
      }));
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    // 2. Tentar persistir no Supabase
    try {
      const payload = {
        id: version.id,
        name: version.name,
        year: version.year,
        is_current: version.isCurrent,
        legal_notice: version.legalNotice,
        min_exempt_salary: version.minExemptSalary,
        meal_exempt_card: version.mealExemptCard,
        meal_exempt_cash: version.mealExemptCash,
        brackets_table_i: version.bracketsTableI,
        brackets_table_iv: version.bracketsTableIV,
        brackets_deficientes: version.bracketsDeficientes,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("tabelas_irs")
        .upsert(payload, { onConflict: "id" });

      if (error && error.code !== "42P01") {
        console.warn("Aviso ao guardar no Supabase:", error.message);
      }
    } catch (dbErr) {
      console.warn("Supabase indisponível no momento, guardado localmente:", dbErr);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao guardar versão" };
  }
}

/**
 * Repõe as versões predefinidas de fábrica
 */
export async function resetToDefaultVersions(): Promise<IRSTableVersion[]> {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_VERSIONS));
  return DEFAULT_VERSIONS;
}

// =========================================================================
// PARSER PARA IMPORTAÇÃO DE FICHEIROS DA AT (.CSV / .XLSX / TEXTO COPIADO)
// =========================================================================

/**
 * Lê texto de um CSV ou Excel copiado e extrai as linhas de escalões
 * Formatos suportados:
 * - Colunas da AT: "Até X,XX €", "Taxa %", "Parcela a abater", "Dedução por dependente"
 * - CSV simples separado por ponto e vírgula ou vírgula
 */
export function parseATImportFile(rawContent: string): {
  success: boolean;
  brackets?: IRSBracketRow[];
  error?: string;
  detectedRows?: number;
} {
  try {
    if (!rawContent || !rawContent.trim()) {
      return { success: false, error: "O conteúdo do ficheiro está vazio." };
    }

    const lines = rawContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const brackets: IRSBracketRow[] = [];

    for (const line of lines) {
      // Ignorar cabeçalhos
      if (
        line.toLowerCase().includes("remunera") ||
        line.toLowerCase().includes("escalão") ||
        line.toLowerCase().includes("taxa marginal") ||
        line.toLowerCase().includes("tabela")
      ) {
        continue;
      }

      // Detetar delimitador (; ou \t ou ,)
      const delimiter = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
      const parts = line.split(delimiter).map((p) => p.trim());

      if (parts.length < 2) continue;

      // Limpar número (trocar vírgula decimal para ponto, remover símbolos monetários e percentagens)
      const cleanNum = (str: string) => {
        if (!str) return 0;
        const cleaned = str
          .replace(/€/g, "")
          .replace(/%/g, "")
          .replace(/\s/g, "")
          .replace(/\./g, "") // remove separador de milhar
          .replace(",", "."); // troca vírgula decimal
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      // Tentar extrair limite
      let limit = cleanNum(parts[0]);
      if (parts[0].toLowerCase().includes("superior") || parts[0].toLowerCase().includes("mais")) {
        limit = 999999;
      }

      // Tentar extrair taxa
      const rate = cleanNum(parts[1]);

      // Tentar extrair parcela a abater
      const deductionFixed = parts.length >= 3 ? cleanNum(parts[2]) : 0;

      // Tentar extrair dedução dependente
      const dependentDeduction = parts.length >= 4 ? cleanNum(parts[3]) : 21.43;

      if (limit > 0 || rate > 0) {
        brackets.push({
          limit,
          rate,
          deductionFixed,
          dependentDeduction,
        });
      }
    }

    if (brackets.length === 0) {
      return {
        success: false,
        error:
          "Não foi possível detetar escalões válidos. Certifique-se de que o ficheiro contém colunas com [Limite, Taxa %, Parcela a abater, Parcela dependente].",
      };
    }

    // Ordenar por limite ascendente
    brackets.sort((a, b) => a.limit - b.limit);

    return {
      success: true,
      brackets,
      detectedRows: brackets.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Erro ao processar ficheiro: ${err?.message || "Formato desconhecido"}`,
    };
  }
}
