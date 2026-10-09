import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  Upload,
  Plus,
  Trash2,
  CloudUpload,
  RotateCcw,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  IRSTableVersion,
  IRSBracketRow,
  loadIRSTableVersions,
  saveIRSTableVersion,
  resetToDefaultVersions,
  parseATImportFile,
} from "@/lib/irsTablesService";

interface GerirTabelasDialogProps {
  onVersionUpdated?: (activeVersion: IRSTableVersion) => void;
  triggerButton?: React.ReactNode;
}

export function GerirTabelasDialog({ onVersionUpdated, triggerButton }: GerirTabelasDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<IRSTableVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [currentVersion, setCurrentVersion] = useState<IRSTableVersion | null>(null);

  // Estado da aba de Importação da AT (Opção B)
  const [importText, setImportText] = useState("");
  const [importTargetTable, setImportTargetTable] = useState<"tableI" | "tableIV" | "deficientes">("tableI");
  const [importPreview, setImportPreview] = useState<{
    success: boolean;
    brackets?: IRSBracketRow[];
    error?: string;
    detectedRows?: number;
  } | null>(null);

  // Carregar versões ao abrir
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    const list = await loadIRSTableVersions();
    setVersions(list);

    // Selecionar a versão atual ou a primeira
    const current = list.find((v) => v.isCurrent) || list[0];
    if (current) {
      setSelectedVersionId(current.id);
      setCurrentVersion(JSON.parse(JSON.stringify(current))); // Deep copy
    }
    setLoading(false);
  };

  const handleSelectVersion = (versionId: string) => {
    if (versionId === "nova_versao") {
      // Criar nova versão clonando a atual
      const base = currentVersion || versions[0];
      const newVer: IRSTableVersion = {
        id: `versao_${Date.now()}`,
        name: `${base?.year || new Date().getFullYear()} - Nova Alteração (Despacho Intercalar)`,
        year: base?.year || new Date().getFullYear(),
        isCurrent: true,
        legalNotice: "Despacho n.º ____/____ publicado em Diário da República",
        minExemptSalary: base?.minExemptSalary || 920.0,
        mealExemptCard: base?.mealExemptCard || 10.46,
        mealExemptCash: base?.mealExemptCash || 6.15,
        bracketsTableI: JSON.parse(JSON.stringify(base?.bracketsTableI || [])),
        bracketsTableIV: JSON.parse(JSON.stringify(base?.bracketsTableIV || [])),
        bracketsDeficientes: JSON.parse(JSON.stringify(base?.bracketsDeficientes || [])),
        updatedAt: new Date().toISOString(),
      };
      setVersions([newVer, ...versions]);
      setSelectedVersionId(newVer.id);
      setCurrentVersion(newVer);
      toast.info("Nova versão criada! Pode agora editar ou importar os novos escalões.");
      return;
    }

    setSelectedVersionId(versionId);
    const found = versions.find((v) => v.id === versionId);
    if (found) {
      setCurrentVersion(JSON.parse(JSON.stringify(found)));
    }
  };

  // Atualizar campo de cabeçalho
  const updateField = (field: keyof IRSTableVersion, value: any) => {
    if (!currentVersion) return;
    setCurrentVersion({ ...currentVersion, [field]: value });
  };

  // Editar linha de escalão da Tabela I
  const updateBracketRow = (index: number, field: keyof IRSBracketRow, value: number) => {
    if (!currentVersion) return;
    const rows = [...currentVersion.bracketsTableI];
    rows[index] = { ...rows[index], [field]: value };
    setCurrentVersion({ ...currentVersion, bracketsTableI: rows });
  };

  // Adicionar novo escalão
  const handleAddBracket = () => {
    if (!currentVersion) return;
    const lastRow = currentVersion.bracketsTableI[currentVersion.bracketsTableI.length - 1];
    const newLimit = lastRow ? lastRow.limit + 500 : 1000;
    const newRow: IRSBracketRow = {
      limit: newLimit,
      rate: lastRow ? lastRow.rate + 3 : 15,
      deductionFixed: lastRow ? lastRow.deductionFixed + 40 : 80,
      dependentDeduction: 21.43,
    };
    setCurrentVersion({
      ...currentVersion,
      bracketsTableI: [...currentVersion.bracketsTableI, newRow],
    });
  };

  // Remover escalão
  const handleRemoveBracket = (index: number) => {
    if (!currentVersion || currentVersion.bracketsTableI.length <= 1) {
      toast.warning("A tabela deve ter pelo menos um escalão.");
      return;
    }
    const rows = currentVersion.bracketsTableI.filter((_, i) => i !== index);
    setCurrentVersion({ ...currentVersion, bracketsTableI: rows });
  };

  // Analisar importação de ficheiro ou texto (Opção B)
  const handleAnalyzeImport = () => {
    if (!importText.trim()) {
      toast.warning("Cole o texto ou carregue um ficheiro com os escalões da AT.");
      return;
    }
    const res = parseATImportFile(importText);
    setImportPreview(res);
    if (res.success && res.brackets) {
      toast.success(`${res.detectedRows} escalões detetados com sucesso!`);
    } else {
      toast.error(res.error || "Erro na análise do ficheiro");
    }
  };

  // Aplicar escalões importados à versão
  const handleApplyImport = () => {
    if (!currentVersion || !importPreview?.brackets || importPreview.brackets.length === 0) return;

    if (importTargetTable === "tableI") {
      setCurrentVersion({
        ...currentVersion,
        bracketsTableI: importPreview.brackets,
      });
    } else if (importTargetTable === "tableIV") {
      setCurrentVersion({
        ...currentVersion,
        bracketsTableIV: importPreview.brackets,
      });
    } else {
      setCurrentVersion({
        ...currentVersion,
        bracketsDeficientes: importPreview.brackets,
      });
    }

    toast.success(`Escalões aplicados com sucesso à ${importTargetTable === "tableI" ? "Tabela I" : "tabela selecionada"}!`);
    setImportPreview(null);
    setImportText("");
  };

  // Ler ficheiro via input file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
      // Analisar logo
      const res = parseATImportFile(content);
      setImportPreview(res);
      if (res.success) {
        toast.success(`Ficheiro lido: ${res.detectedRows} escalões detetados.`);
      } else {
        toast.error(res.error || "Erro ao ler ficheiro");
      }
    };
    reader.readAsText(file);
  };

  // Guardar Versão na Nuvem (Supabase) e Localmente
  const handleSave = async () => {
    if (!currentVersion) return;
    setLoading(true);
    const res = await saveIRSTableVersion(currentVersion);
    setLoading(false);

    if (res.success) {
      toast.success("Tabela fiscal guardada na Nuvem (Supabase) e ativada com sucesso!");
      if (onVersionUpdated) {
        onVersionUpdated(currentVersion);
      }
      setOpen(false);
    } else {
      toast.error(res.error || "Erro ao guardar tabela");
    }
  };

  // Repor valores de fábrica
  const handleReset = async () => {
    if (!confirm("Tem a certeza que deseja repor as tabelas originais da lei?")) return;
    setLoading(true);
    const defaults = await resetToDefaultVersions();
    setVersions(defaults);
    const cur = defaults.find((v) => v.isCurrent) || defaults[0];
    setCurrentVersion(cur);
    setSelectedVersionId(cur.id);
    setLoading(false);
    toast.success("Tabelas repostas com as predefinições oficiais.");
    if (onVersionUpdated && cur) {
      onVersionUpdated(cur);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
            <Settings className="w-4 h-4" />
            <span>Gerir Escalões & Importar AT</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Gestor de Tabelas de Retenção de IRS</DialogTitle>
              <DialogDescription className="text-xs">
                Edite os escalões fiscais ou importe diretamente ficheiros da Autoridade Tributária (.csv / .xlsx).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Barra de Seleção de Versão */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <Label className="text-xs font-semibold text-muted-foreground">Versão Fiscal em Edição</Label>
              <Select value={selectedVersionId} onValueChange={handleSelectVersion}>
                <SelectTrigger className="font-medium bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((ver) => (
                    <SelectItem key={ver.id} value={ver.id}>
                      {ver.name} {ver.isCurrent ? "★ (Em Vigor)" : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="nova_versao" className="text-primary font-semibold">
                    + Criar Nova Versão (Despacho Intercalar)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-destructive gap-1"
                title="Repor despachos oficiais originais"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Repor Oficiais
              </Button>
            </div>
          </div>

          {currentVersion && (
            <>
              {/* Metadados da Versão */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-border bg-background">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Nome da Versão</Label>
                  <Input
                    value={currentVersion.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="h-8 text-xs font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ano Fiscal</Label>
                  <Input
                    type="number"
                    value={currentVersion.year}
                    onChange={(e) => updateField("year", Number(e.target.value) || 2026)}
                    className="h-8 text-xs font-medium"
                  />
                </div>

                <div className="flex items-center justify-between sm:justify-center gap-2 pt-4">
                  <Label htmlFor="isCurrent" className="text-xs font-medium cursor-pointer">
                    Ativa por Defeito
                  </Label>
                  <Switch
                    id="isCurrent"
                    checked={currentVersion.isCurrent}
                    onCheckedChange={(checked) => updateField("isCurrent", checked)}
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Despacho / Referência Legal</Label>
                  <Input
                    value={currentVersion.legalNotice}
                    onChange={(e) => updateField("legalNotice", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Ex: Despacho n.º 233-A/2026"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Salário Mínimo Isento (€)</Label>
                  <Input
                    type="number"
                    step="5"
                    value={currentVersion.minExemptSalary}
                    onChange={(e) => updateField("minExemptSalary", Number(e.target.value) || 920)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Teto Cartão Refeição (€)</Label>
                  <Input
                    type="number"
                    step="0.10"
                    value={currentVersion.mealExemptCard}
                    onChange={(e) => updateField("mealExemptCard", Number(e.target.value) || 10.46)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Tabs de Gestão: Tabela Visual vs Importar da AT */}
              <Tabs defaultValue="tabela-visual" className="space-y-4">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="tabela-visual" className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Escalões de IRS (Tabela I)</span>
                  </TabsTrigger>
                  <TabsTrigger value="importar-at" className="gap-2">
                    <Upload className="w-4 h-4" />
                    <span>Importar Ficheiro da AT (.csv / .xlsx)</span>
                  </TabsTrigger>
                </TabsList>

                {/* ABA 1: Edição Visual dos Escalões (Opção A) */}
                <TabsContent value="tabela-visual" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Tabela I: Trabalho Dependente (Não casado sem dependentes ou casado 2 titulares)
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddBracket}
                      className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Escalão
                    </Button>
                  </div>

                  <div className="border border-border rounded-lg overflow-x-auto max-h-[340px]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted text-muted-foreground font-semibold sticky top-0 border-b border-border z-10">
                        <tr>
                          <th className="p-2.5">Remuneração Até (€)</th>
                          <th className="p-2.5">Taxa Marginal (%)</th>
                          <th className="p-2.5">Parcela a Abater (€)</th>
                          <th className="p-2.5">Parcela Dependente (€)</th>
                          <th className="p-2.5 text-center w-12">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {currentVersion.bracketsTableI.map((row, idx) => (
                          <tr key={idx} className="hover:bg-muted/20">
                            <td className="p-2">
                              <Input
                                type="number"
                                step="50"
                                value={row.limit >= 999999 ? "999999" : row.limit}
                                onChange={(e) => updateBracketRow(idx, "limit", Number(e.target.value) || 0)}
                                className="h-7 text-xs font-medium"
                              />
                            </td>
                            <td className="p-2">
                              <div className="relative">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={row.rate}
                                  onChange={(e) => updateBracketRow(idx, "rate", Number(e.target.value) || 0)}
                                  className="h-7 text-xs font-medium pr-5"
                                />
                                <span className="absolute right-2 top-1.5 text-muted-foreground text-[10px]">%</span>
                              </div>
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.5"
                                value={row.deductionFixed}
                                onChange={(e) => updateBracketRow(idx, "deductionFixed", Number(e.target.value) || 0)}
                                className="h-7 text-xs font-medium"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.1"
                                value={row.dependentDeduction}
                                onChange={(e) => updateBracketRow(idx, "dependentDeduction", Number(e.target.value) || 0)}
                                className="h-7 text-xs font-medium"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveBracket(idx)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Eliminar escalão"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ABA 2: Importação Rápida da AT (Opção B) */}
                <TabsContent value="importar-at" className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-xs text-muted-foreground space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4" />
                      Como importar os escalões oficiais da AT?
                    </div>
                    <p>
                      Quando o Ministério das Finanças publica um novo despacho, a AT disponibiliza um ficheiro em Excel/CSV no Portal das Finanças.
                      Pode carregar o ficheiro abaixo ou copiar as células e colar diretamente na caixa de texto.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Carregar Ficheiro da AT (.csv / .txt)</Label>
                      <Input
                        type="file"
                        accept=".csv,.txt,.tsv"
                        onChange={handleFileUpload}
                        className="text-xs file:text-xs file:font-semibold"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Tabela de Destino</Label>
                      <Select
                        value={importTargetTable}
                        onValueChange={(val: "tableI" | "tableIV" | "deficientes") => setImportTargetTable(val)}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tableI">Tabela I (Geral - Não casado / Casado 2 tit.)</SelectItem>
                          <SelectItem value="tableIV">Tabela IV (Casado único titular)</SelectItem>
                          <SelectItem value="deficientes">Tabela Deficientes (≥ 60%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Ou Cole os Dados Copiados (CSV / Linhas do Excel)</Label>
                    <Textarea
                      rows={5}
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={`Exemplo de formato aceite:\n920; 0%; 0; 0\n1042; 12.5%; 89.00; 21.43\n1108; 15.7%; 78.50; 21.43\n1250; 17.5%; 98.40; 21.43\nsuperior; 45%; 940.75; 21.43`}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeImport}
                      className="text-xs gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      Analisar Dados
                    </Button>

                    {importPreview?.success && (
                      <Button
                        size="sm"
                        onClick={handleApplyImport}
                        className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Substituir Escalões ({importPreview.detectedRows} linhas)
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-border flex justify-between sm:justify-between items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading || !currentVersion}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
          >
            <CloudUpload className="w-4 h-4" />
            {loading ? "A Guardar na Nuvem..." : "Guardar & Ativar no Simulador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
