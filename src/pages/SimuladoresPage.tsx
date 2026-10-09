import React, { useState, useMemo, useEffect } from "react";
import {
  Calculator,
  Building2,
  ArrowRightLeft,
  Briefcase,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  TrendingUp,
  Percent,
  Euro,
  HelpCircle,
  FileSpreadsheet,
  Download,
  Share2,
  Sliders,
  ShieldAlert,
  ArrowUpRight,
  UserCheck,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  SalaryInput,
  TaxRegion,
  MaritalStatus,
  MealAllowanceType,
  DuodecimosType,
  IRSJovemYear,
  calculateSalary,
  calculateGrossFromNet,
  calculateIndependentWorker,
  MEAL_EXEMPT_CARD,
  MEAL_EXEMPT_CASH,
  MIN_SALARY_EXEMPT,
} from "@/lib/salaryCalculator";
import {
  IRSTableVersion,
  loadIRSTableVersions,
} from "@/lib/irsTablesService";
import { GerirTabelasDialog } from "@/components/GerirTabelasDialog";

export default function SimuladoresPage() {
  const [activeTab, setActiveTab] = useState("salario-liquido");
  const [copied, setCopied] = useState(false);

  // --- Estado do Simulador de Salário Líquido / Custo Empresa ---
  const [grossSalary, setGrossSalary] = useState<number>(1400);
  const [region, setRegion] = useState<TaxRegion>("continente");
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>("nao_casado");
  const [dependents, setDependents] = useState<number>(0);
  const [hasDisability, setHasDisability] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealAllowanceType>("cartao");
  const [mealDaily, setMealDaily] = useState<number>(9.60);
  const [mealDays, setMealDays] = useState<number>(22);
  const [duodecimos, setDuodecimos] = useState<DuodecimosType>("nenhum");
  const [irsJovem, setIrsJovem] = useState<IRSJovemYear>(0);
  const [isMoe, setIsMoe] = useState<boolean>(false);
  const [otherTaxable, setOtherTaxable] = useState<number>(0);
  const [otherNonTaxable, setOtherNonTaxable] = useState<number>(0);
  const [workInsuranceRate, setWorkInsuranceRate] = useState<number>(1.5);

  // --- Estado do Simulador Inverso ---
  const [targetNet, setTargetNet] = useState<number>(1200);

  // --- Estado do Comparador Recibos Verdes ---
  const [independentMonthly, setIndependentMonthly] = useState<number>(2000);
  const [independentActivity, setIndependentActivity] = useState<"servicos" | "vendas">("servicos");
  const [independentFirstYear, setIndependentFirstYear] = useState<boolean>(false);

  // --- Estado da Versão das Tabelas de IRS (Nuvem / Supabase / AT) ---
  const [tableVersions, setTableVersions] = useState<IRSTableVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<IRSTableVersion | null>(null);

  useEffect(() => {
    loadIRSTableVersions().then((list) => {
      setTableVersions(list);
      const cur = list.find((v) => v.isCurrent) || list[0];
      setSelectedVersion(cur);
    });
  }, []);

  // Cálculo reativo do Salário e Custo de Empresa
  const salaryResult = useMemo(() => {
    return calculateSalary({
      grossSalary,
      region,
      maritalStatus,
      dependents,
      hasDisability,
      mealDaily,
      mealDays,
      mealType,
      duodecimos,
      irsJovem,
      otherTaxable,
      otherNonTaxable,
      isMoe,
      workInsuranceRate: workInsuranceRate / 100,
      tableVersion: selectedVersion || undefined,
    });
  }, [
    grossSalary,
    region,
    maritalStatus,
    dependents,
    hasDisability,
    mealDaily,
    mealDays,
    mealType,
    duodecimos,
    irsJovem,
    otherTaxable,
    otherNonTaxable,
    isMoe,
    workInsuranceRate,
    selectedVersion,
  ]);

  // Cálculo do Simulador Inverso
  const calculatedGross = useMemo(() => {
    return calculateGrossFromNet(targetNet, {
      region,
      maritalStatus,
      dependents,
      hasDisability,
      mealDaily,
      mealDays,
      mealType,
      duodecimos,
      irsJovem,
      otherTaxable,
      otherNonTaxable,
      isMoe,
      workInsuranceRate: workInsuranceRate / 100,
      tableVersion: selectedVersion || undefined,
    });
  }, [
    targetNet,
    region,
    maritalStatus,
    dependents,
    hasDisability,
    mealDaily,
    mealDays,
    mealType,
    duodecimos,
    irsJovem,
    otherTaxable,
    otherNonTaxable,
    isMoe,
    workInsuranceRate,
    selectedVersion,
  ]);

  const inverseResult = useMemo(() => {
    return calculateSalary({
      grossSalary: calculatedGross,
      region,
      maritalStatus,
      dependents,
      hasDisability,
      mealDaily,
      mealDays,
      mealType,
      duodecimos,
      irsJovem,
      otherTaxable,
      otherNonTaxable,
      isMoe,
      workInsuranceRate: workInsuranceRate / 100,
      tableVersion: selectedVersion || undefined,
    });
  }, [
    calculatedGross,
    region,
    maritalStatus,
    dependents,
    hasDisability,
    mealDaily,
    mealDays,
    mealType,
    duodecimos,
    irsJovem,
    otherTaxable,
    otherNonTaxable,
    isMoe,
    workInsuranceRate,
    selectedVersion,
  ]);

  // Cálculo Recibos Verdes
  const independentResult = useMemo(() => {
    return calculateIndependentWorker(
      independentMonthly,
      independentActivity,
      0.25,
      independentFirstYear
    );
  }, [independentMonthly, independentActivity, independentFirstYear]);

  // Formatação em Euro
  const formatEUR = (value: number) => {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value || 0);
  };

  // Copiar Resumo da Simulação
  const handleCopySummary = () => {
    const text = `📊 SIMULAÇÃO SALARIAL - INTERCONTA / OFFICE OWL
------------------------------------------------
• Vencimento Base Bruto: ${formatEUR(grossSalary)}
• Região: ${region.toUpperCase()} | Dependentes: ${dependents}
• Subsídio Alimentação (${mealType}): ${formatEUR(salaryResult.mealAllowanceTotal)}
• Dedução Segurança Social (${(salaryResult.socialSecurityRate * 100).toFixed(1)}%): -${formatEUR(salaryResult.socialSecurityAmount)}
• Retenção IRS (Taxa Efetiva ${(salaryResult.irsEffectiveRate * 100).toFixed(1)}%): -${formatEUR(salaryResult.irsEffectiveRetention)}
------------------------------------------------
💰 SALÁRIO LÍQUIDO MENSAL: ${formatEUR(salaryResult.netSalaryMonthly)}
💵 Total Anual Líquido Estimado: ${formatEUR(salaryResult.netAnnualTotal)}
🏢 Custo Total Médio Empresa: ${formatEUR(salaryResult.employerCosts.totalMonthlyCost)} / mês
------------------------------------------------
Calculado com base nas tabelas em vigor (Modelo Marginal de IRS)`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Resumo da simulação copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header com gradiente */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Calculator className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Simuladores Fiscais & Salariais
            </h1>
            <Badge variant="outline" className="ml-2 border-primary/30 text-primary font-medium">
              Portugal 2025 / 2026
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Cálculo oficial de IRS pelo Modelo de Taxas Marginais, Segurança Social, custos empresariais e recibos verdes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="gap-2 border-border/80 shadow-sm hover:bg-accent"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar Resumo"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setGrossSalary(1400);
              setDependents(0);
              setMealDaily(9.60);
              setIrsJovem(0);
              setDuodecimos("nenhum");
              toast.info("Valores repostos para a configuração padrão.");
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Repor padrões"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Barra de Seleção de Vigência Fiscal e Gestor de Tabelas da AT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
            <Sliders className="w-4 h-4 text-primary" />
            <span>Tabela Fiscal em Vigor:</span>
          </div>

          <Select
            value={selectedVersion?.id || ""}
            onValueChange={(val) => {
              const found = tableVersions.find((v) => v.id === val);
              if (found) {
                setSelectedVersion(found);
                toast.success(`Tabela alterada para: ${found.name}`);
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs font-medium w-[240px] sm:w-[320px] bg-background">
              <SelectValue placeholder="Selecione a versão fiscal" />
            </SelectTrigger>
            <SelectContent>
              {tableVersions.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.name} {v.isCurrent ? "★ (Atual)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedVersion && (
            <Badge variant="outline" className="text-[11px] font-normal border-primary/20 text-muted-foreground hidden lg:inline-flex">
              Salário Mínimo Isento: {formatEUR(selectedVersion.minExemptSalary)}
            </Badge>
          )}
        </div>

        <GerirTabelasDialog
          onVersionUpdated={(updatedVer) => {
            loadIRSTableVersions().then((list) => {
              setTableVersions(list);
              setSelectedVersion(updatedVer);
            });
          }}
        />
      </div>

      {/* Navegação entre Simuladores */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1.5 bg-muted/60 rounded-xl border border-border">
          <TabsTrigger value="salario-liquido" className="gap-2 py-2.5 data-[state=active]:shadow-sm">
            <Calculator className="w-4 h-4" />
            <span className="font-semibold">Salário Líquido</span>
          </TabsTrigger>
          <TabsTrigger value="custo-empresa" className="gap-2 py-2.5 data-[state=active]:shadow-sm">
            <Building2 className="w-4 h-4" />
            <span className="font-semibold">Custo da Empresa</span>
          </TabsTrigger>
          <TabsTrigger value="simulador-inverso" className="gap-2 py-2.5 data-[state=active]:shadow-sm">
            <ArrowRightLeft className="w-4 h-4" />
            <span className="font-semibold">Líquido ➜ Bruto</span>
          </TabsTrigger>
          <TabsTrigger value="recibos-verdes" className="gap-2 py-2.5 data-[state=active]:shadow-sm">
            <Briefcase className="w-4 h-4" />
            <span className="font-semibold">Recibos Verdes</span>
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* ABA 1: SIMULADOR DE SALÁRIO LÍQUIDO                      */}
        {/* ======================================================== */}
        <TabsContent value="salario-liquido" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna da Esquerda: Parâmetros (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Rendimento Base & Localização */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Euro className="w-4 h-4 text-primary" />
                    Vencimento Base & Enquadramento
                  </CardTitle>
                  <CardDescription>
                    Introduza o salário base e a situação geográfica do contribuinte.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="grossSalary" className="font-medium text-sm">
                        Salário Bruto Base Mensal
                      </Label>
                      <span className="text-base font-bold text-primary">
                        {formatEUR(grossSalary)}
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="grossSalary"
                        type="number"
                        min="0"
                        step="50"
                        value={grossSalary || ""}
                        onChange={(e) => setGrossSalary(Number(e.target.value) || 0)}
                        className="pl-8 text-base font-medium"
                      />
                      <span className="absolute left-3 top-2.5 text-muted-foreground">€</span>
                    </div>
                    {/* Slider de ajuste rápido */}
                    <Slider
                      value={[grossSalary]}
                      min={820}
                      max={6000}
                      step={25}
                      onValueChange={(val) => setGrossSalary(val[0])}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Mínimo: {formatEUR(MIN_SALARY_EXEMPT)}</span>
                      <span>1.500 €</span>
                      <span>3.000 €</span>
                      <span>6.000 €</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Região Fiscal</Label>
                      <Select value={region} onValueChange={(val: TaxRegion) => setRegion(val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continente">Portugal Continental</SelectItem>
                          <SelectItem value="madeira">R.A. da Madeira (-15%)</SelectItem>
                          <SelectItem value="acores">R.A. dos Açores (-25%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Estado Civil & Titulares</Label>
                      <Select value={maritalStatus} onValueChange={(val: MaritalStatus) => setMaritalStatus(val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao_casado">Não Casado (Solteiro/Divorciado/Viúvo)</SelectItem>
                          <SelectItem value="casado_dois_titulares">Casado (2 Titulares)</SelectItem>
                          <SelectItem value="casado_unico_titular">Casado (1 Único Titular)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Número de Dependentes</Label>
                      <Select value={String(dependents)} onValueChange={(val) => setDependents(Number(val))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Dependentes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sem dependentes</SelectItem>
                          <SelectItem value="1">1 Dependente</SelectItem>
                          <SelectItem value="2">2 Dependentes</SelectItem>
                          <SelectItem value="3">3 Dependentes (-1% taxa)</SelectItem>
                          <SelectItem value="4">4 Dependentes</SelectItem>
                          <SelectItem value="5">5 ou mais</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 mt-1">
                      <div>
                        <Label htmlFor="disability" className="text-xs font-medium cursor-pointer">
                          Deficiência (≥ 60%)
                        </Label>
                        <p className="text-[11px] text-muted-foreground">Tabela bonificada de IRS</p>
                      </div>
                      <Switch
                        id="disability"
                        checked={hasDisability}
                        onCheckedChange={setHasDisability}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Subsídio de Alimentação & Pagamento de Subsídios */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    Subsídios, Duodécimos & Regalias
                  </CardTitle>
                  <CardDescription>
                    Configure o subsídio de refeição e a modalidade de férias e natal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Modo de Pagamento</Label>
                      <Select value={mealType} onValueChange={(val: MealAllowanceType) => setMealType(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cartao">Cartão Refeição</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro / Transferência</SelectItem>
                          <SelectItem value="nenhum">Sem Subsídio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="mealDaily" className="text-xs font-medium text-muted-foreground">
                          Valor Diário (€)
                        </Label>
                        {mealType !== "nenhum" && (
                          <span className="text-[10px] text-muted-foreground">
                            Isento até {mealType === "cartao" ? formatEUR(MEAL_EXEMPT_CARD) : formatEUR(MEAL_EXEMPT_CASH)}
                          </span>
                        )}
                      </div>
                      <Input
                        id="mealDaily"
                        type="number"
                        step="0.10"
                        disabled={mealType === "nenhum"}
                        value={mealDaily || ""}
                        onChange={(e) => setMealDaily(Number(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="mealDays" className="text-xs font-medium text-muted-foreground">
                        Dias Trabalhados / Mês
                      </Label>
                      <Input
                        id="mealDays"
                        type="number"
                        disabled={mealType === "nenhum"}
                        value={mealDays || ""}
                        onChange={(e) => setMealDays(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  {/* Aviso do teto de isenção de refeição */}
                  {mealType !== "nenhum" && salaryResult.mealAllowanceTaxable > 0 && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>Atenção:</strong> O valor excede o teto legal de isenção fiscal (
                        {mealType === "cartao" ? formatEUR(MEAL_EXEMPT_CARD) : formatEUR(MEAL_EXEMPT_CASH)}/dia).{" "}
                        O excedente de <strong>{formatEUR(salaryResult.mealAllowanceTaxable)}/mês</strong> fica sujeito a IRS e Segurança Social.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Duodécimos (Férias e Natal)</Label>
                      <Select value={duodecimos} onValueChange={(val: DuodecimosType) => setDuodecimos(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Sem Duodécimos (14 Meses)</SelectItem>
                          <SelectItem value="50_ambos">50% de Ambos os Subsídios</SelectItem>
                          <SelectItem value="100_ambos">100% de Ambos os Subsídios</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-muted-foreground">Regime IRS Jovem</Label>
                        {irsJovem > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600">
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <Select value={String(irsJovem)} onValueChange={(val) => setIrsJovem(Number(val) as IRSJovemYear)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Não aplicável</SelectItem>
                          <SelectItem value="1">1.º Ano (Isenção até 100%)</SelectItem>
                          <SelectItem value="2">2.º Ano (Isenção de 75%)</SelectItem>
                          <SelectItem value="3">3.º Ano (Isenção de 50%)</SelectItem>
                          <SelectItem value="4">4.º Ano (Isenção de 50%)</SelectItem>
                          <SelectItem value="5">5.º Ano (Isenção de 25%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Complementos Opcionais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
                    <div className="space-y-1.5">
                      <Label htmlFor="otherTaxable" className="text-xs font-medium text-muted-foreground">
                        Outros Rendimentos Tributáveis (€)
                      </Label>
                      <Input
                        id="otherTaxable"
                        type="number"
                        placeholder="0.00"
                        value={otherTaxable || ""}
                        onChange={(e) => setOtherTaxable(Number(e.target.value) || 0)}
                      />
                      <p className="text-[10px] text-muted-foreground">Ex: Horas extra, bónus, prémios</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="otherNonTaxable" className="text-xs font-medium text-muted-foreground">
                        Rendimentos Não Tributáveis (€)
                      </Label>
                      <Input
                        id="otherNonTaxable"
                        type="number"
                        placeholder="0.00"
                        value={otherNonTaxable || ""}
                        onChange={(e) => setOtherNonTaxable(Number(e.target.value) || 0)}
                      />
                      <p className="text-[10px] text-muted-foreground">Ex: Ajudas de custo, passes sociais</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                    <div>
                      <Label htmlFor="moe" className="text-xs font-medium cursor-pointer">
                        Membro de Órgão Estatutário (MOE / Gerente)
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Aplica taxa de Segurança Social de 9,4% (em vez de 11%)</p>
                    </div>
                    <Switch
                      id="moe"
                      checked={isMoe}
                      onCheckedChange={setIsMoe}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Coluna da Direita: Resultados em Destaque (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card Destaque Salário Líquido */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-3 right-3 opacity-15">
                  <Sparkles className="w-24 h-24 text-emerald-600 dark:text-emerald-400" />
                </div>

                <div className="relative space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300">
                      Salário Líquido Mensal
                    </span>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-medium">
                      Na Conta Bancária
                    </Badge>
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                    {formatEUR(salaryResult.netSalaryMonthly)}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Corresponde a{" "}
                    <strong>
                      {salaryResult.totalSubjectToIRS > 0
                        ? ((salaryResult.netSalaryMonthly / (grossSalary + salaryResult.mealAllowanceTotal)) * 100).toFixed(1)
                        : "100"}
                      %
                    </strong>{" "}
                    do total de rendimentos auferidos no mês.
                  </p>

                  <div className="pt-2 border-t border-emerald-500/20 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Total Anual Líquido:</span>
                      <p className="font-bold text-foreground text-sm">
                        {formatEUR(salaryResult.netAnnualTotal)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Custo Empresa Médio:</span>
                      <p className="font-bold text-foreground text-sm">
                        {formatEUR(salaryResult.employerCosts.totalMonthlyCost)}/mês
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Barra Visual de Distribuição */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Distribuição do Vencimento</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Base Tributável: {formatEUR(salaryResult.totalSubjectToIRS)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Barra Progressiva Segmentada */}
                  <div className="h-4 w-full rounded-full overflow-hidden flex bg-muted shadow-inner">
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          (salaryResult.netSalaryMonthly /
                            (salaryResult.netSalaryMonthly +
                              salaryResult.socialSecurityAmount +
                              salaryResult.irsEffectiveRetention)) *
                            100
                        )}%`,
                      }}
                      className="bg-emerald-500 transition-all duration-300"
                      title="Salário Líquido"
                    />
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          (salaryResult.socialSecurityAmount /
                            (salaryResult.netSalaryMonthly +
                              salaryResult.socialSecurityAmount +
                              salaryResult.irsEffectiveRetention)) *
                            100
                        )}%`,
                      }}
                      className="bg-blue-500 transition-all duration-300"
                      title="Segurança Social"
                    />
                    <div
                      style={{
                        width: `${Math.max(
                          0,
                          (salaryResult.irsEffectiveRetention /
                            (salaryResult.netSalaryMonthly +
                              salaryResult.socialSecurityAmount +
                              salaryResult.irsEffectiveRetention)) *
                            100
                        )}%`,
                      }}
                      className="bg-amber-500 transition-all duration-300"
                      title="Retenção IRS"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center justify-center gap-1 text-emerald-600 font-semibold mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Líquido
                      </div>
                      <span className="font-bold text-foreground">
                        {formatEUR(salaryResult.netSalaryMonthly)}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center justify-center gap-1 text-blue-600 font-semibold mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Seg. Social
                      </div>
                      <span className="font-bold text-foreground">
                        {formatEUR(salaryResult.socialSecurityAmount)}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center justify-center gap-1 text-amber-600 font-semibold mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        IRS
                      </div>
                      <span className="font-bold text-foreground">
                        {formatEUR(salaryResult.irsEffectiveRetention)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Discriminação Detalhada (Simulador de Recibo de Vencimento) */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    Discriminação do Recibo Salarial
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Vencimento Base</span>
                    <span className="font-medium text-foreground">{formatEUR(salaryResult.baseGross)}</span>
                  </div>

                  {salaryResult.mealAllowanceTotal > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                      <div>
                        <span className="text-muted-foreground">Subsídio de Alimentação ({mealDays} dias)</span>
                        <div className="text-[10px] text-emerald-600">
                          Isento: {formatEUR(salaryResult.mealAllowanceExempt)}
                          {salaryResult.mealAllowanceTaxable > 0 && ` | Tributado: ${formatEUR(salaryResult.mealAllowanceTaxable)}`}
                        </div>
                      </div>
                      <span className="font-medium text-foreground">{formatEUR(salaryResult.mealAllowanceTotal)}</span>
                    </div>
                  )}

                  {duodecimos !== "nenhum" && (
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                      <span className="text-muted-foreground">Duodécimos Líquidos ({duodecimos === "50_ambos" ? "50%" : "100%"})</span>
                      <span className="font-medium text-emerald-600">+{formatEUR(salaryResult.duodecimosNet)}</span>
                    </div>
                  )}

                  {otherTaxable > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                      <span className="text-muted-foreground">Outros Rendimentos Tributáveis</span>
                      <span className="font-medium text-foreground">+{formatEUR(otherTaxable)}</span>
                    </div>
                  )}

                  {otherNonTaxable > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                      <span className="text-muted-foreground">Rendimentos Isentos (Ajudas Custo/Passes)</span>
                      <span className="font-medium text-foreground">+{formatEUR(otherNonTaxable)}</span>
                    </div>
                  )}

                  {/* Deduções */}
                  <div className="flex justify-between py-1.5 border-b border-border/50 text-blue-600 dark:text-blue-400">
                    <div>
                      <span className="font-medium">Desconto Segurança Social</span>
                      <div className="text-[10px] text-muted-foreground">
                        Taxa: {(salaryResult.socialSecurityRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <span className="font-bold">-{formatEUR(salaryResult.socialSecurityAmount)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-border/50 text-amber-600 dark:text-amber-400">
                    <div>
                      <span className="font-medium">Retenção na Fonte de IRS</span>
                      <div className="text-[10px] text-muted-foreground">
                        Taxa Marginal: {(salaryResult.irsMarginalRate * 100).toFixed(1)}% | Efetiva: {(salaryResult.irsEffectiveRate * 100).toFixed(1)}%
                      </div>
                      {salaryResult.irsJovemDiscount > 0 && (
                        <div className="text-[10px] text-emerald-600">
                          Benefício IRS Jovem: -{formatEUR(salaryResult.irsJovemDiscount)}
                        </div>
                      )}
                    </div>
                    <span className="font-bold">-{formatEUR(salaryResult.irsEffectiveRetention)}</span>
                  </div>

                  <div className="flex justify-between py-2 pt-3 font-bold text-sm bg-muted/30 px-3 rounded-lg">
                    <span className="text-foreground">Líquido a Receber</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {formatEUR(salaryResult.netSalaryMonthly)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 2: CUSTO TOTAL DA EMPRESA (COST-TO-COMPANY)          */}
        {/* ======================================================== */}
        <TabsContent value="custo-empresa" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <Card className="shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Parâmetros de Custo Patronal
                  </CardTitle>
                  <CardDescription>
                    Configure os encargos obrigatórios da entidade empregadora (TSU, Seguros e Higiene no Trabalho).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="font-medium text-sm">Vencimento Base do Colaborador</Label>
                      <span className="font-bold text-primary">{formatEUR(grossSalary)}</span>
                    </div>
                    <Slider
                      value={[grossSalary]}
                      min={820}
                      max={6000}
                      step={25}
                      onValueChange={(val) => setGrossSalary(val[0])}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">TSU Patronal</Label>
                      <div className="p-2.5 rounded-lg border border-border bg-muted/20 text-sm font-semibold flex justify-between">
                        <span>{isMoe ? "Gerência / MOE" : "Regime Geral"}</span>
                        <span className="text-primary font-bold">
                          {(salaryResult.employerCosts.tsuRate * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="workInsurance" className="text-xs font-medium text-muted-foreground">
                          Seguro Acidentes Trabalho (%)
                        </Label>
                        <span className="text-xs font-bold text-primary">{workInsuranceRate}%</span>
                      </div>
                      <Input
                        id="workInsurance"
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="5.0"
                        value={workInsuranceRate}
                        onChange={(e) => setWorkInsuranceRate(Number(e.target.value) || 1.5)}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <Info className="w-4 h-4" />
                      O que está incluído no Custo Total Anual?
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      <li>14 meses de vencimento base (inclui subsídio de férias e de natal)</li>
                      <li>TSU Patronal de 23,75% sobre os 14 salários e complementos sujeitos</li>
                      <li>Seguro de acidentes de trabalho obrigatório ({workInsuranceRate}%)</li>
                      <li>Subsídio de refeição relativo a 11 meses de trabalho efetivo</li>
                      <li>Encargo estimado com Medicina e Segurança no Trabalho (~150 €/ano)</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border border-blue-500/30 shadow-lg relative">
                <span className="text-xs uppercase font-bold tracking-wider text-blue-700 dark:text-blue-300">
                  Custo Total Médio Mensal
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
                  {formatEUR(salaryResult.employerCosts.totalMonthlyCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Custo total anualizado dividido por 12 meses.
                </p>

                <div className="mt-4 pt-3 border-t border-blue-500/20 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Custo Anual Total:</span>
                    <p className="font-bold text-foreground text-sm">
                      {formatEUR(salaryResult.employerCosts.totalAnnualCost)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rácio Custo / Líquido:</span>
                    <p className="font-bold text-foreground text-sm">
                      {salaryResult.employerCosts.costToNetRatio.toFixed(2)}x
                    </p>
                  </div>
                </div>
              </div>

              {/* Discriminação de Custos para a Empresa */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Estrutura de Custos da Empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Salários Base Brutos (14 Meses / 12)</span>
                    <span className="font-medium text-foreground">
                      {formatEUR((grossSalary * 14) / 12)} / mês
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">
                      TSU Patronal ({(salaryResult.employerCosts.tsuRate * 100).toFixed(2)}%)
                    </span>
                    <span className="font-medium text-foreground">
                      {formatEUR(salaryResult.employerCosts.tsuAmountMonthly)} / mês
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Seguro Acidentes de Trabalho</span>
                    <span className="font-medium text-foreground">
                      {formatEUR(salaryResult.employerCosts.workInsuranceAmountMonthly)} / mês
                    </span>
                  </div>

                  {salaryResult.mealAllowanceTotal > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-border/50">
                      <span className="text-muted-foreground">Subsídio de Alimentação Médio (11 meses / 12)</span>
                      <span className="font-medium text-foreground">
                        {formatEUR((salaryResult.mealAllowanceTotal * 11) / 12)} / mês
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Medicina no Trabalho</span>
                    <span className="font-medium text-foreground">
                      {formatEUR(salaryResult.employerCosts.occupationalMedicineMonthly)} / mês
                    </span>
                  </div>

                  <div className="flex justify-between py-2 pt-3 font-bold text-sm bg-muted/30 px-3 rounded-lg">
                    <span className="text-foreground">Custo Total da Empresa</span>
                    <span className="text-primary">
                      {formatEUR(salaryResult.employerCosts.totalMonthlyCost)} / mês
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 3: SIMULADOR INVERSO (DO LÍQUIDO PARA O BRUTO)       */}
        {/* ======================================================== */}
        <TabsContent value="simulador-inverso" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <Card className="shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-primary" />
                    Qual é o Salário Líquido que o Colaborador pretende?
                  </CardTitle>
                  <CardDescription>
                    Introduza o valor limpo que o trabalhador quer receber na conta bancária. O sistema calcula o bruto exato necessário.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="targetNet" className="font-medium text-sm">
                        Líquido Pretendido na Mão (€)
                      </Label>
                      <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatEUR(targetNet)}
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="targetNet"
                        type="number"
                        min="700"
                        step="50"
                        value={targetNet || ""}
                        onChange={(e) => setTargetNet(Number(e.target.value) || 0)}
                        className="pl-8 text-base font-medium"
                      />
                      <span className="absolute left-3 top-2.5 text-muted-foreground">€</span>
                    </div>
                    <Slider
                      value={[targetNet]}
                      min={800}
                      max={4000}
                      step={25}
                      onValueChange={(val) => setTargetNet(val[0])}
                      className="py-2"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-muted/20 text-xs space-y-2">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Configuração ativa para esta simulação:
                    </div>
                    <p className="text-muted-foreground">
                      Região: <strong>{region.toUpperCase()}</strong> | Dependentes: <strong>{dependents}</strong> |
                      Subsídio Alimentação: <strong>{formatEUR(mealDaily)}/dia ({mealType})</strong> |
                      IRS Jovem: <strong>{irsJovem > 0 ? `Ano ${irsJovem}` : "Não"}</strong>
                    </p>
                    <p className="text-[11px] text-muted-foreground italic">
                      *Os parâmetros de estado civil e subsídios são herdados do simulador principal para assegurar consistência.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5 space-y-6">
              {/* Resultado do Bruto Necessário */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/30 shadow-lg">
                <span className="text-xs uppercase font-bold tracking-wider text-primary">
                  Salário Bruto Necessário
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
                  {formatEUR(calculatedGross)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Vencimento base a colocar no contrato de trabalho para atingir <strong>{formatEUR(targetNet)}</strong> líquidos.
                </p>

                <div className="mt-4 pt-3 border-t border-primary/20 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dedução Segurança Social (11%):</span>
                    <span className="font-semibold text-foreground">
                      -{formatEUR(inverseResult.socialSecurityAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Retenção IRS (Taxa Efetiva {(inverseResult.irsEffectiveRate * 100).toFixed(1)}%):
                    </span>
                    <span className="font-semibold text-foreground">
                      -{formatEUR(inverseResult.irsEffectiveRetention)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/50">
                    <span className="font-medium text-muted-foreground">Custo Total para a Empresa:</span>
                    <span className="font-bold text-primary">
                      {formatEUR(inverseResult.employerCosts.totalMonthlyCost)} / mês
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 4: RECIBOS VERDES (TRABALHADOR INDEPENDENTE)         */}
        {/* ======================================================== */}
        <TabsContent value="recibos-verdes" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <Card className="shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    Simulação de Recibos Verdes
                  </CardTitle>
                  <CardDescription>
                    Regime Simplificado com retenção na fonte padrão de 25% e contribuição para a Segurança Social (21,4% sobre 70% da faturação).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="independentMonthly" className="font-medium text-sm">
                        Valor Médio Faturado por Mês (Sem IVA)
                      </Label>
                      <span className="text-xl font-bold text-primary">
                        {formatEUR(independentMonthly)}
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="independentMonthly"
                        type="number"
                        min="200"
                        step="100"
                        value={independentMonthly || ""}
                        onChange={(e) => setIndependentMonthly(Number(e.target.value) || 0)}
                        className="pl-8 text-base font-medium"
                      />
                      <span className="absolute left-3 top-2.5 text-muted-foreground">€</span>
                    </div>
                    <Slider
                      value={[independentMonthly]}
                      min={500}
                      max={8000}
                      step={50}
                      onValueChange={(val) => setIndependentMonthly(val[0])}
                      className="py-2"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Atividade</Label>
                      <Select
                        value={independentActivity}
                        onValueChange={(val: "servicos" | "vendas") => setIndependentActivity(val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="servicos">Prestação de Serviços (Coef. 70%)</SelectItem>
                          <SelectItem value="vendas">Venda de Mercadorias (Coef. 20%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                      <div>
                        <Label htmlFor="firstYear" className="text-xs font-medium cursor-pointer">
                          1.º Ano de Atividade
                        </Label>
                        <p className="text-[11px] text-muted-foreground">Isenção de Seg. Social nos primeiros 12 meses</p>
                      </div>
                      <Switch
                        id="firstYear"
                        checked={independentFirstYear}
                        onCheckedChange={setIndependentFirstYear}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500/15 via-purple-500/5 to-transparent border border-purple-500/30 shadow-lg">
                <span className="text-xs uppercase font-bold tracking-wider text-purple-700 dark:text-purple-300">
                  Líquido Estimado nos Recibos Verdes
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
                  {formatEUR(independentResult.netMonthly)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Valor líquido mensal disponível após retenção de IRS e Segurança Social.
                </p>

                <div className="mt-4 pt-3 border-t border-purple-500/20 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturação Bruta Mensal:</span>
                    <span className="font-semibold text-foreground">{formatEUR(independentResult.monthlyInvoiced)}</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Retenção na Fonte IRS (25%):</span>
                    <span className="font-semibold">-{formatEUR(independentResult.irsRetentionMonthly)}</span>
                  </div>
                  <div className="flex justify-between text-blue-600">
                    <span>Segurança Social (21,4%):</span>
                    <span className="font-semibold">
                      {independentFirstYear ? "0.00 € (Isento)" : `-${formatEUR(independentResult.socialSecurityMonthly)}`}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/50">
                    <span className="font-medium text-muted-foreground">Total Anual Líquido (12 meses):</span>
                    <span className="font-bold text-foreground">{formatEUR(independentResult.netAnnual)}</span>
                  </div>
                </div>
              </div>

              {/* Comparador Rápido: Recibos Verdes vs Contrato */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Scale className="w-4 h-4 text-primary" />
                    Comparativo Rápido (Contrato vs Recibos Verdes)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-muted/40 space-y-1.5">
                    <div className="flex justify-between font-medium">
                      <span>Contrato de Trabalho (Base {formatEUR(grossSalary)})</span>
                      <span className="text-emerald-600 font-bold">{formatEUR(salaryResult.netSalaryMonthly)}/mês</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Recebe 14 meses de vencimento + subsídio de refeição isento + proteção social integral.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 space-y-1.5">
                    <div className="flex justify-between font-medium">
                      <span>Recibos Verdes (Fatura {formatEUR(independentMonthly)})</span>
                      <span className="text-purple-600 font-bold">{formatEUR(independentResult.netMonthly)}/mês</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Recebe apenas 12 meses (sem subsídios de férias/natal) e assume os encargos por conta própria.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
