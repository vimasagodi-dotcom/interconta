/**
 * Motor de Cálculo Salarial e Fiscal para Portugal (IRS, Segurança Social e Custos da Empresa)
 * Legislação e Tabelas de Retenção na Fonte (Modelo de Taxas Marginais)
 */

import { IRSTableVersion } from "./irsTablesService";

export type TaxRegion = 'continente' | 'madeira' | 'acores';
export type MaritalStatus = 'nao_casado' | 'casado_dois_titulares' | 'casado_unico_titular';
export type MealAllowanceType = 'cartao' | 'dinheiro' | 'nenhum';
export type DuodecimosType = 'nenhum' | '50_ambos' | '100_ambos';
export type IRSJovemYear = 0 | 1 | 2 | 3 | 4 | 5;

export interface SalaryInput {
  grossSalary: number;            // Salário bruto base mensal
  region: TaxRegion;              // Continente, Madeira ou Açores
  maritalStatus: MaritalStatus;   // Estado civil e titulares
  dependents: number;             // Número de dependentes (0 a 10)
  hasDisability: boolean;         // Deficiência comprovada >= 60%
  mealDaily: number;              // Valor diário do subsídio de refeição (ex: 9.60€)
  mealDays: number;               // Dias úteis trabalhados no mês (default 22)
  mealType: MealAllowanceType;     // Cartão refeição, dinheiro/transferência ou nenhum
  duodecimos: DuodecimosType;     // Modalidade de duodécimos
  irsJovem: IRSJovemYear;         // Ano de IRS Jovem (0 se não aplicável)
  otherTaxable: number;           // Outros rendimentos tributáveis (bónus, horas extra)
  otherNonTaxable: number;        // Rendimentos isentos (ajudas de custo, km, passes)
  isMoe: boolean;                 // Membro de Órgãos Estatutários (MOE / Gerente)
  workInsuranceRate?: number;     // Taxa de seguro acidentes de trabalho da empresa (default 1.5%)
  tableVersion?: IRSTableVersion; // Versão dinâmica das tabelas de IRS (carregada do Supabase ou importada)
}

export interface SalaryResult {
  baseGross: number;
  otherTaxable: number;
  otherNonTaxable: number;
  
  // Subsídio de Refeição
  mealAllowanceTotal: number;
  mealAllowanceExempt: number;
  mealAllowanceTaxable: number;
  
  // Bases de Incidência
  totalSubjectToSS: number;
  totalSubjectToIRS: number;
  
  // Duodécimos
  duodecimosGross: number;
  duodecimosSS: number;
  duodecimosIRS: number;
  duodecimosNet: number;
  
  // Segurança Social (Trabalhador)
  socialSecurityRate: number;
  socialSecurityAmount: number;
  
  // IRS (Retenção na Fonte)
  irsMarginalRate: number;
  irsDeduction: number;
  irsDependentsDeduction: number;
  irsBaseRetention: number;
  irsJovemDiscount: number;
  irsEffectiveRetention: number;
  irsEffectiveRate: number;       // Percentagem retida em relação ao bruto tributável
  
  // Salário Líquido Mensal
  netSalaryMonthly: number;       // O que entra na conta no mês habitual
  netAnnualTotal: number;         // Total anual líquido (14 meses ou com duodécimos)
  
  // Custos da Empresa (Cost-to-Company)
  employerCosts: {
    tsuRate: number;
    tsuAmountMonthly: number;
    workInsuranceRate: number;
    workInsuranceAmountMonthly: number;
    occupationalMedicineMonthly: number;
    totalMonthlyCost: number;     // Custo total médio por mês
    totalAnnualCost: number;      // Custo total anual
    costToNetRatio: number;       // Rácio custo empresa / líquido do trabalhador
  };
}

// Limites legais de isenção de subsídio de alimentação (Valores oficiais Portugal)
export const MEAL_EXEMPT_CASH = 6.15;   // Numerário / Transferência bancária
export const MEAL_EXEMPT_CARD = 10.46;  // Cartão / Vales de Refeição (ex: Coverflex, Ticket)
export const MIN_SALARY_EXEMPT = 920.00; // Salário Mínimo Nacional (isenção de retenção IRS)

interface IRSBracket {
  limit: number;
  rate: number;
  deductionFormula?: (salary: number) => number;
  deductionFixed?: number;
  dependentDeduction: number;
}

/**
 * Tabelas Oficiais de Retenção na Fonte de IRS (Modelo Marginal)
 */
function getBrackets(
  region: TaxRegion,
  status: MaritalStatus,
  hasDisability: boolean,
  tableVersion?: IRSTableVersion
): IRSBracket[] {
  // Coeficiente regional (Madeira ~ -15%, Açores ~ -25% nas taxas)
  const rateFactor = region === 'acores' ? 0.75 : region === 'madeira' ? 0.85 : 1.0;

  // Se uma versão personalizada ou carregada da nuvem estiver ativa
  if (tableVersion) {
    let sourceRows = tableVersion.bracketsTableI;
    if (hasDisability && tableVersion.bracketsDeficientes?.length > 0) {
      sourceRows = tableVersion.bracketsDeficientes;
    } else if (status === 'casado_unico_titular' && tableVersion.bracketsTableIV?.length > 0) {
      sourceRows = tableVersion.bracketsTableIV;
    }

    if (sourceRows && sourceRows.length > 0) {
      return sourceRows.map(r => ({
        limit: r.limit,
        rate: (r.rate > 1 ? r.rate / 100 : r.rate) * rateFactor,
        deductionFixed: r.deductionFixed * rateFactor,
        dependentDeduction: r.dependentDeduction,
      }));
    }
  }

  // Sujeito com Deficiência (>= 60%)
  if (hasDisability) {
    return [
      { limit: 1450, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { limit: 2200, rate: 0.12 * rateFactor, deductionFixed: 174 * rateFactor, dependentDeduction: 28.5 },
      { limit: 3500, rate: 0.18 * rateFactor, deductionFixed: 306 * rateFactor, dependentDeduction: 28.5 },
      { limit: 5000, rate: 0.24 * rateFactor, deductionFixed: 516 * rateFactor, dependentDeduction: 28.5 },
      { limit: Infinity, rate: 0.32 * rateFactor, deductionFixed: 916 * rateFactor, dependentDeduction: 28.5 },
    ];
  }

  // Tabela IV: Casado Único Titular
  if (status === 'casado_unico_titular') {
    return [
      { limit: 920, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { 
        limit: 1200, 
        rate: 0.10 * rateFactor, 
        deductionFormula: (R) => 0.10 * 2.50 * (1500 - R) * rateFactor, 
        dependentDeduction: 42.86 
      },
      { limit: 1500, rate: 0.13 * rateFactor, deductionFixed: 65 * rateFactor, dependentDeduction: 42.86 },
      { limit: 1850, rate: 0.165 * rateFactor, deductionFixed: 117.5 * rateFactor, dependentDeduction: 42.86 },
      { limit: 2300, rate: 0.21 * rateFactor, deductionFixed: 200.75 * rateFactor, dependentDeduction: 42.86 },
      { limit: 2900, rate: 0.25 * rateFactor, deductionFixed: 292.75 * rateFactor, dependentDeduction: 42.86 },
      { limit: 3700, rate: 0.295 * rateFactor, deductionFixed: 423.25 * rateFactor, dependentDeduction: 42.86 },
      { limit: 4900, rate: 0.34 * rateFactor, deductionFixed: 589.75 * rateFactor, dependentDeduction: 42.86 },
      { limit: 6500, rate: 0.385 * rateFactor, deductionFixed: 810.25 * rateFactor, dependentDeduction: 42.86 },
      { limit: Infinity, rate: 0.43 * rateFactor, deductionFixed: 1102.75 * rateFactor, dependentDeduction: 42.86 },
    ];
  }

  // Tabela II: Não Casado com dependentes (Monoparental)
  if (status === 'nao_casado') {
    return [
      { limit: 920, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
      { 
        limit: 1042, 
        rate: 0.125 * rateFactor, 
        deductionFormula: (R) => 0.125 * 2.60 * (1273.85 - R) * rateFactor, 
        dependentDeduction: 34.29 
      },
      { limit: 1108, rate: 0.157 * rateFactor, deductionFixed: 78.50 * rateFactor, dependentDeduction: 34.29 },
      { limit: 1250, rate: 0.175 * rateFactor, deductionFixed: 98.40 * rateFactor, dependentDeduction: 34.29 },
      { limit: 1450, rate: 0.210 * rateFactor, deductionFixed: 142.10 * rateFactor, dependentDeduction: 34.29 },
      { limit: 1800, rate: 0.241 * rateFactor, deductionFixed: 187.05 * rateFactor, dependentDeduction: 34.29 },
      { limit: 2200, rate: 0.275 * rateFactor, deductionFixed: 248.25 * rateFactor, dependentDeduction: 34.29 },
      { limit: 2800, rate: 0.310 * rateFactor, deductionFixed: 325.25 * rateFactor, dependentDeduction: 34.29 },
      { limit: 3600, rate: 0.350 * rateFactor, deductionFixed: 437.25 * rateFactor, dependentDeduction: 34.29 },
      { limit: 4800, rate: 0.380 * rateFactor, deductionFixed: 545.25 * rateFactor, dependentDeduction: 34.29 },
      { limit: 6500, rate: 0.415 * rateFactor, deductionFixed: 713.25 * rateFactor, dependentDeduction: 34.29 },
      { limit: Infinity, rate: 0.450 * rateFactor, deductionFixed: 940.75 * rateFactor, dependentDeduction: 34.29 },
    ];
  }

  // Tabela I e III: Casado dois titulares (com ou sem dependentes)
  return [
    { limit: 920, rate: 0.0, deductionFixed: 0, dependentDeduction: 0 },
    { 
      limit: 1042, 
      rate: 0.125 * rateFactor, 
      deductionFormula: (R) => 0.125 * 2.60 * (1273.85 - R) * rateFactor, 
      dependentDeduction: 21.43 
    },
    { limit: 1108, rate: 0.157 * rateFactor, deductionFixed: 78.50 * rateFactor, dependentDeduction: 21.43 },
    { limit: 1250, rate: 0.175 * rateFactor, deductionFixed: 98.40 * rateFactor, dependentDeduction: 21.43 },
    { limit: 1450, rate: 0.210 * rateFactor, deductionFixed: 142.10 * rateFactor, dependentDeduction: 21.43 },
    { limit: 1800, rate: 0.241 * rateFactor, deductionFixed: 187.05 * rateFactor, dependentDeduction: 21.43 },
    { limit: 2200, rate: 0.275 * rateFactor, deductionFixed: 248.25 * rateFactor, dependentDeduction: 21.43 },
    { limit: 2800, rate: 0.310 * rateFactor, deductionFixed: 325.25 * rateFactor, dependentDeduction: 21.43 },
    { limit: 3600, rate: 0.350 * rateFactor, deductionFixed: 437.25 * rateFactor, dependentDeduction: 21.43 },
    { limit: 4800, rate: 0.380 * rateFactor, deductionFixed: 545.25 * rateFactor, dependentDeduction: 21.43 },
    { limit: 6500, rate: 0.415 * rateFactor, deductionFixed: 713.25 * rateFactor, dependentDeduction: 21.43 },
    { limit: Infinity, rate: 0.450 * rateFactor, deductionFixed: 940.75 * rateFactor, dependentDeduction: 21.43 },
  ];
}

/**
 * Calcula a retenção de IRS para uma determinada remuneração mensal bruta
 */
export function calculateIRS(
  salary: number,
  region: TaxRegion,
  status: MaritalStatus,
  dependents: number,
  hasDisability: boolean,
  irsJovem: IRSJovemYear,
  tableVersion?: IRSTableVersion
): {
  marginalRate: number;
  deduction: number;
  dependentsDeduction: number;
  baseRetention: number;
  jovemDiscount: number;
  effectiveRetention: number;
} {
  const minExempt = tableVersion?.minExemptSalary ?? MIN_SALARY_EXEMPT;
  if (salary <= minExempt && !hasDisability) {
    return {
      marginalRate: 0,
      deduction: 0,
      dependentsDeduction: 0,
      baseRetention: 0,
      jovemDiscount: 0,
      effectiveRetention: 0,
    };
  }

  const brackets = getBrackets(region, status, hasDisability, tableVersion);
  const bracket = brackets.find(b => salary <= b.limit) || brackets[brackets.length - 1];

  let marginalRate = bracket.rate;

  // Bonificação para famílias com 3 ou mais dependentes: -1% na taxa marginal máxima
  if (dependents >= 3 && marginalRate > 0.01) {
    marginalRate -= 0.01;
  }

  // Parcela a abater
  let deduction = 0;
  if (bracket.deductionFormula) {
    deduction = bracket.deductionFormula(salary);
  } else if (bracket.deductionFixed !== undefined) {
    deduction = bracket.deductionFixed;
  }

  // Dedução adicional por dependentes
  const dependentsDeduction = bracket.dependentDeduction * dependents;

  // Cálculo da retenção base
  const grossTax = salary * marginalRate;
  let baseRetention = Math.max(0, grossTax - deduction - dependentsDeduction);

  // IRS Jovem: isenção escalonada
  let jovemDiscount = 0;
  if (irsJovem > 0) {
    const jovemRates: Record<IRSJovemYear, number> = {
      0: 0,
      1: 1.0,   // 1º ano: 100% isenção (ou 75% teto)
      2: 0.75,  // 2º ano: 75%
      3: 0.50,  // 3º ano: 50%
      4: 0.50,  // 4º ano: 50%
      5: 0.25,  // 5º ano: 25%
    };
    const discountRate = jovemRates[irsJovem] || 0;
    jovemDiscount = baseRetention * discountRate;
  }

  const effectiveRetention = Math.max(0, baseRetention - jovemDiscount);

  return {
    marginalRate,
    deduction,
    dependentsDeduction,
    baseRetention,
    jovemDiscount,
    effectiveRetention,
  };
}

/**
 * Função Principal de Cálculo Salarial Completo
 */
export function calculateSalary(input: SalaryInput): SalaryResult {
  const {
    grossSalary = 0,
    region = 'continente',
    maritalStatus = 'nao_casado',
    dependents = 0,
    hasDisability = false,
    mealDaily = 0,
    mealDays = 22,
    mealType = 'cartao',
    duodecimos = 'nenhum',
    irsJovem = 0,
    otherTaxable = 0,
    otherNonTaxable = 0,
    isMoe = false,
    workInsuranceRate = 0.015,
    tableVersion,
  } = input;

  // 1. Subsídio de Alimentação (com limites dinâmicos da versão ativa)
  const mealAllowanceTotal = mealDaily * mealDays;
  const mealExemptCardLimit = tableVersion?.mealExemptCard ?? MEAL_EXEMPT_CARD;
  const mealExemptCashLimit = tableVersion?.mealExemptCash ?? MEAL_EXEMPT_CASH;

  let exemptDailyLimit = 0;
  if (mealType === 'dinheiro') exemptDailyLimit = mealExemptCashLimit;
  if (mealType === 'cartao') exemptDailyLimit = mealExemptCardLimit;

  const mealAllowanceExempt = Math.min(mealAllowanceTotal, exemptDailyLimit * mealDays);
  const mealAllowanceTaxable = Math.max(0, mealAllowanceTotal - mealAllowanceExempt);

  // 2. Bases de Incidência Mensais
  const totalSubjectToSS = grossSalary + otherTaxable + mealAllowanceTaxable;
  const totalSubjectToIRS = grossSalary + otherTaxable + mealAllowanceTaxable;

  // 3. Segurança Social (Trabalhador)
  const socialSecurityRate = isMoe ? 0.094 : 0.11; // 9.4% para MOE, 11% trabalhador
  const socialSecurityAmount = totalSubjectToSS * socialSecurityRate;

  // 4. IRS (Retenção na Fonte) do mês normal
  const irsCalc = calculateIRS(
    totalSubjectToIRS,
    region,
    maritalStatus,
    dependents,
    hasDisability,
    irsJovem,
    tableVersion
  );

  // 5. Duodécimos (Subsídio de Férias e de Natal)
  // Cada subsídio completo equivale a 1 mês de salário bruto base
  let duodecimosFactor = 0;
  if (duodecimos === '50_ambos') {
    // 50% de férias + 50% de natal distribuídos por 12 meses = (0.5 + 0.5) / 12 = 1 / 12 do salário
    duodecimosFactor = 1 / 12;
  } else if (duodecimos === '100_ambos') {
    // 100% de férias + 100% de natal distribuídos por 12 meses = (1.0 + 1.0) / 12 = 2 / 12 do salário
    duodecimosFactor = 2 / 12;
  }

  const duodecimosGross = grossSalary * duodecimosFactor;
  const duodecimosSS = duodecimosGross * socialSecurityRate;

  // Retenção na fonte dos duodécimos (retenção autónoma pela mesma taxa de IRS do base)
  const duodecimosIRS = duodecimosGross * (irsCalc.effectiveRetention / (totalSubjectToIRS || 1));
  const duodecimosNet = duodecimosGross - duodecimosSS - duodecimosIRS;

  // 6. Salário Líquido Mensal
  // O colaborador recebe: Salário Base + Outros Rendimentos + Alimentação Total - SS - IRS + Duodécimos Líquidos
  const netSalaryMonthly = 
    grossSalary + 
    otherTaxable + 
    otherNonTaxable + 
    mealAllowanceTotal + 
    duodecimosNet - 
    socialSecurityAmount - 
    irsCalc.effectiveRetention;

  // 7. Estimativa Anual Líquida
  // Em 14 meses normais: 12 meses normais + 2 meses de subsídios líquidos
  // Se estiver em duodécimos a 100%: 12 x netSalaryMonthly
  let netAnnualTotal = 0;
  if (duodecimos === '100_ambos') {
    netAnnualTotal = netSalaryMonthly * 12;
  } else if (duodecimos === '50_ambos') {
    // 12 meses com 50% duodécimos + 2 metades pagas à parte
    const singleSubsidyNet = grossSalary * 0.5 - (grossSalary * 0.5 * socialSecurityRate) - (grossSalary * 0.5 * (irsCalc.effectiveRetention / (totalSubjectToIRS || 1)));
    netAnnualTotal = (netSalaryMonthly * 12) + (singleSubsidyNet * 2);
  } else {
    // 14 meses tradicionais: 12 salários mensais normais + 2 subsídios completos líquidos
    const singleSubsidyNet = grossSalary - (grossSalary * socialSecurityRate) - (grossSalary * (irsCalc.effectiveRetention / (totalSubjectToIRS || 1)));
    netAnnualTotal = (netSalaryMonthly * 12) + (singleSubsidyNet * 2);
  }

  // 8. Custos da Empresa (Cost-to-Company)
  const tsuRate = isMoe ? 0.2030 : 0.2375; // 23.75% ou 20.3%
  const occupationalMedicineMonthly = 150 / 12; // ~150€ anuais por trabalhador
  
  // A TSU patronal incide sobre 14 meses de vencimento base + 12 meses de complementos e excesso de refeição
  const annualSubjectToTSU = (grossSalary * 14) + ((otherTaxable + mealAllowanceTaxable) * 12);
  const annualEmployerTSU = annualSubjectToTSU * tsuRate;
  const tsuAmountMonthly = annualEmployerTSU / 12;

  // Seguro de Acidentes de Trabalho (sobre os 14 meses de salário)
  const annualInsurance = (grossSalary * 14) * workInsuranceRate;
  const workInsuranceAmountMonthly = annualInsurance / 12;

  // Custo Total Anual da Empresa:
  // 14 salários base + 12 meses de outros complementos + 11 meses de alimentação + TSU + Seguros + Medicina
  const totalAnnualCost = 
    (grossSalary * 14) + 
    (otherTaxable * 12) + 
    (otherNonTaxable * 12) + 
    (mealAllowanceTotal * 11) + // Média de 11 meses trabalhados
    annualEmployerTSU + 
    annualInsurance + 
    150;

  const totalMonthlyCost = totalAnnualCost / 12;
  const costToNetRatio = netSalaryMonthly > 0 ? (totalMonthlyCost / netSalaryMonthly) : 0;

  return {
    baseGross: grossSalary,
    otherTaxable,
    otherNonTaxable,
    mealAllowanceTotal,
    mealAllowanceExempt,
    mealAllowanceTaxable,
    totalSubjectToSS,
    totalSubjectToIRS,
    duodecimosGross,
    duodecimosSS,
    duodecimosIRS,
    duodecimosNet,
    socialSecurityRate,
    socialSecurityAmount,
    irsMarginalRate: irsCalc.marginalRate,
    irsDeduction: irsCalc.deduction,
    irsDependentsDeduction: irsCalc.dependentsDeduction,
    irsBaseRetention: irsCalc.baseRetention,
    irsJovemDiscount: irsCalc.jovemDiscount,
    irsEffectiveRetention: irsCalc.effectiveRetention,
    irsEffectiveRate: totalSubjectToIRS > 0 ? (irsCalc.effectiveRetention / totalSubjectToIRS) : 0,
    netSalaryMonthly,
    netAnnualTotal,
    employerCosts: {
      tsuRate,
      tsuAmountMonthly,
      workInsuranceRate,
      workInsuranceAmountMonthly,
      occupationalMedicineMonthly,
      totalMonthlyCost,
      totalAnnualCost,
      costToNetRatio,
    },
  };
}

/**
 * Simulador Inverso: Calcular Salário Bruto Necessário para atingir determinado Líquido Pretendido
 */
export function calculateGrossFromNet(
  targetNet: number,
  baseInput: Omit<SalaryInput, 'grossSalary'>
): number {
  if (targetNet <= 0) return 0;

  // Algoritmo de bissecção para encontrar o bruto com precisão ao cêntimo
  let low = 0;
  let high = targetNet * 3; // Estimativa máxima
  let bestGross = low;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const res = calculateSalary({ ...baseInput, grossSalary: mid });

    if (Math.abs(res.netSalaryMonthly - targetNet) < 0.05) {
      bestGross = mid;
      break;
    }

    if (res.netSalaryMonthly < targetNet) {
      low = mid;
    } else {
      high = mid;
    }
    bestGross = mid;
  }

  return Math.round(bestGross * 100) / 100;
}

/**
 * Simulador Trabalhador Independente (Recibos Verdes)
 */
export interface IndependentWorkerResult {
  monthlyInvoiced: number;
  annualInvoiced: number;
  relevantIncomeCoefficient: number;
  relevantIncomeAnnual: number;
  socialSecurityRate: number;
  socialSecurityMonthly: number;
  socialSecurityAnnual: number;
  irsRetentionRate: number;
  irsRetentionMonthly: number;
  irsRetentionAnnual: number;
  netMonthly: number;
  netAnnual: number;
  effectiveTaxRate: number;
}

export function calculateIndependentWorker(
  monthlyInvoiced: number,
  activityType: 'servicos' | 'vendas',
  irsRetentionRate: number = 0.25, // 25% taxa padrão recibos verdes
  isFirstYearExemptSS: boolean = false
): IndependentWorkerResult {
  const annualInvoiced = monthlyInvoiced * 12;
  const relevantIncomeCoefficient = activityType === 'servicos' ? 0.70 : 0.20; // Base SS
  const relevantIncomeAnnual = annualInvoiced * relevantIncomeCoefficient;
  
  // Taxa de Segurança Social: 21.4% sobre o rendimento relevante
  const socialSecurityRate = isFirstYearExemptSS ? 0 : 0.214;
  const socialSecurityAnnual = relevantIncomeAnnual * socialSecurityRate;
  const socialSecurityMonthly = socialSecurityAnnual / 12;

  // Retenção na Fonte de IRS
  const irsRetentionMonthly = monthlyInvoiced * irsRetentionRate;
  const irsRetentionAnnual = irsRetentionMonthly * 12;

  // Rendimento Líquido
  const netMonthly = monthlyInvoiced - socialSecurityMonthly - irsRetentionMonthly;
  const netAnnual = netMonthly * 12;
  const totalDeductions = socialSecurityAnnual + irsRetentionAnnual;
  const effectiveTaxRate = annualInvoiced > 0 ? (totalDeductions / annualInvoiced) : 0;

  return {
    monthlyInvoiced,
    annualInvoiced,
    relevantIncomeCoefficient,
    relevantIncomeAnnual,
    socialSecurityRate,
    socialSecurityMonthly,
    socialSecurityAnnual,
    irsRetentionRate,
    irsRetentionMonthly,
    irsRetentionAnnual,
    netMonthly,
    netAnnual,
    effectiveTaxRate,
  };
}
