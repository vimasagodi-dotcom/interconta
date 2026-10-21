import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  Eye,
  CheckCheck,
  FileCheck,
  Building2,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import StatCard from "@/components/StatCard";
import { toast } from "sonner";

import {
  InvoiceItem,
  SupplierReconciliationResult,
  GlobalReconciliationSummary,
  reconcileAll,
} from "@/lib/reconciliation";
import {
  ExcelColumnMapping,
  ExcelParsedPreview,
  parseExcelPreview,
  extractInvoicesFromExcel,
  saveSavedColumnMapping,
} from "@/lib/excelParser";
import {
  ExtractedPdfInvoice,
  ExtractionProgress,
  extractInvoicesFromMultiplePdfs,
} from "@/lib/pdfExtractor";
import { exportReconciliationToExcel, exportOriginalExcelHighlighted } from "@/lib/excelExport";

export default function ReconciliacaoPage() {
  const { user } = useAuth();

  // 1. Estados do fluxo / wizard
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Ficheiro A (Excel)
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelParsedPreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<ExcelColumnMapping>({
    supplierCol: "",
    nifCol: "",
    docNumberCol: "",
    dateCol: "",
    amountCol: "",
  });

  // Ficheiros B (PDFs)
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);

  // Dados extraídos após upload
  const [excelInvoices, setExcelInvoices] = useState<InvoiceItem[]>([]);
  const [pdfInvoices, setPdfInvoices] = useState<ExtractedPdfInvoice[]>([]);

  // Mapeamento manual de fornecedores (chave Excel -> chave PDF)
  const [manualSupplierMapping, setManualSupplierMapping] = useState<Record<string, string>>({});

  // Resultados
  const [reconciliationResult, setReconciliationResult] =
    useState<GlobalReconciliationSummary | null>(null);

  // Filtros de resultados
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [pdfSearchTerm, setPdfSearchTerm] = useState<string>("");

  // Modal de Detalhe por Fornecedor
  const [selectedSupplierDetail, setSelectedSupplierDetail] =
    useState<SupplierReconciliationResult | null>(null);

  // Proteção de rota para colaboradores/admins
  if (user?.role === "cliente") {
    return <Navigate to="/portal" replace />;
  }

  // --- PASSO 1: SELEÇÃO E PROCESSAMENTO DE FICHEIROS ---
  const handleExcelDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleExcelFileSelect(files[0]);
  };

  const handleExcelFileSelect = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Por favor selecione um ficheiro Excel (.xlsx, .xls) ou .csv.");
      return;
    }
    try {
      const preview = await parseExcelPreview(file);
      setExcelFile(file);
      setExcelPreview(preview);
      setColumnMapping(preview.detectedMapping);
      toast.success(`Ficheiro Excel carregado com ${preview.rawRows.length} linhas.`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao ler o ficheiro Excel.");
    }
  };

  const handlePdfDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.match(/\.pdf$/i));
    if (files.length === 0) {
      toast.error("Por favor carregue ficheiros com extensão .pdf.");
      return;
    }
    setPdfFiles((prev) => [...prev, ...files]);
    toast.success(`${files.length} ficheiro(s) PDF adicionado(s).`);
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((f) => f.name.match(/\.pdf$/i));
    setPdfFiles((prev) => [...prev, ...files]);
    toast.success(`${files.length} ficheiro(s) PDF adicionado(s).`);
  };

  const removePdfFile = (index: number) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const loadSampleFiles = async () => {
    try {
      setIsProcessing(true);
      const toastId = toast.loading("A carregar ficheiros de demonstração...");

      // 1. Carregar Excel de Exemplo
      const excelRes = await fetch("/exemplos_reconciliacao/A_Faturas_Fornecedores.xlsx");
      const excelBlob = await excelRes.blob();
      const sampleExcelFile = new File([excelBlob], "A_Faturas_Fornecedores.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      await handleExcelFileSelect(sampleExcelFile);

      // 2. Carregar PDFs de Exemplo
      const pdfNames = [
        "B_Contabilidade_Papelaria_FT001.pdf",
        "B_Contabilidade_Papelaria_FT002.pdf",
        "B_Contabilidade_Tecnologia_FT100.pdf",
        "B_Contabilidade_Tecnologia_FT101.pdf",
        "B_Contabilidade_Tecnologia_FT999_ApenasContab.pdf",
      ];

      const loadedPdfs: File[] = [];
      for (const name of pdfNames) {
        const res = await fetch(`/exemplos_reconciliacao/${name}`);
        const blob = await res.blob();
        loadedPdfs.push(new File([blob], name, { type: "application/pdf" }));
      }

      setPdfFiles(loadedPdfs);
      toast.dismiss(toastId);
      toast.success("Ficheiros de teste carregados com sucesso! Clique em 'Extrair Dados & Rever' para prosseguir.");
    } catch (err: any) {
      toast.error("Erro ao carregar exemplos: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const startExtraction = async () => {
    if (!excelFile || !excelPreview) {
      toast.error("Por favor carregue o ficheiro Excel de faturas dos fornecedores.");
      return;
    }
    if (pdfFiles.length === 0) {
      toast.error("Por favor carregue pelo menos um ficheiro PDF da contabilidade.");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Extrair faturas do Excel com o mapeamento atual
      const parsedExcel = extractInvoicesFromExcel(excelPreview.rawRows, columnMapping);
      setExcelInvoices(parsedExcel);

      // 2. Extrair faturas dos PDFs com monitorização de progresso
      const parsedPdfs = await extractInvoicesFromMultiplePdfs(pdfFiles, (p) => {
        setExtractionProgress(p);
      });
      setPdfInvoices(parsedPdfs);

      toast.success(
        `Extração concluída: ${parsedExcel.length} faturas do Excel e ${parsedPdfs.length} faturas da Contabilidade.`
      );
      setCurrentStep(2);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao processar ficheiros.");
    } finally {
      setIsProcessing(false);
      setExtractionProgress(null);
    }
  };

  // --- PASSO 2: EDIÇÃO E MAPA DE COLUNAS ---
  const handleUpdatePdfInvoice = (
    id: string,
    field: keyof ExtractedPdfInvoice,
    value: any
  ) => {
    setPdfInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== id) return inv;
        const updated = { ...inv, [field]: value };
        if (field === "amount") {
          updated.amountCents = Math.round(Number(value) * 100);
        }
        // Limpar o aviso de baixa confiança para este campo editado
        if (updated.lowConfidenceFields) {
          updated.lowConfidenceFields = updated.lowConfidenceFields.filter((f) => f !== field);
        }
        return updated;
      })
    );
  };

  const handleDeletePdfInvoice = (id: string) => {
    setPdfInvoices((prev) => prev.filter((inv) => inv.id !== id));
    toast.info("Fatura removida da lista.");
  };

  const executeReconciliation = () => {
    // Re-extrair Excel caso o utilizador tenha alterado o mapeamento no passo 2
    if (excelPreview) {
      saveSavedColumnMapping(columnMapping);
      const parsedExcel = extractInvoicesFromExcel(excelPreview.rawRows, columnMapping);
      setExcelInvoices(parsedExcel);

      const summary = reconcileAll(parsedExcel, pdfInvoices, manualSupplierMapping);
      setReconciliationResult(summary);
      setCurrentStep(3);
      toast.success("Reconciliação executada com sucesso!");
    }
  };

  const [isExportingPainted, setIsExportingPainted] = useState(false);

  const handleExportOriginalPainted = async () => {
    if (!excelFile || !reconciliationResult) {
      toast.error("Ficheiro original ou resultados de reconciliação não disponíveis.");
      return;
    }
    try {
      setIsExportingPainted(true);
      const toastId = toast.loading(
        "A gerar ficheiro Excel e-Fatura com linhas reconciliadas pintadas a verde..."
      );
      const res = await exportOriginalExcelHighlighted(excelFile, reconciliationResult);
      toast.dismiss(toastId);
      toast.success(
        `Excel gerado com sucesso! Folha 1: ${res.reconciledCount} faturas reconciliadas a verde. Folha 2: ${res.unreconciledPdfCount} faturas lançadas na contabilidade ausentes no e-Fatura.`
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao exportar Excel: " + (err.message || err));
    } finally {
      setIsExportingPainted(false);
    }
  };

  const reconciledExcelCount = useMemo(() => {
    if (!reconciliationResult) return 0;
    return reconciliationResult.suppliers
      .flatMap((s) => s.allExcelInvoices)
      .filter((inv) => inv.isReconciled).length;
  }, [reconciliationResult]);

  const totalExcelCount = useMemo(() => {
    if (!reconciliationResult) return 0;
    return reconciliationResult.suppliers
      .flatMap((s) => s.allExcelInvoices).length;
  }, [reconciliationResult]);

  const unreconciledPdfCount = useMemo(() => {
    if (!reconciliationResult) return 0;
    return reconciliationResult.suppliers
      .flatMap((s) => s.allPdfInvoices)
      .filter((inv) => !inv.isReconciled).length;
  }, [reconciliationResult]);

  // Lista de fornecedores filtrada nos resultados
  const filteredSuppliers = useMemo(() => {
    if (!reconciliationResult) return [];

    return reconciliationResult.suppliers.filter((s) => {
      // Filtro por Estado
      if (statusFilter !== "todos" && s.status !== statusFilter) {
        return false;
      }
      // Filtro por Pesquisa (Nome ou NIF)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = s.supplierName.toLowerCase().includes(query);
        const matchNif = s.nif ? s.nif.includes(query) : false;
        return matchName || matchNif;
      }
      return true;
    });
  }, [reconciliationResult, statusFilter, searchTerm]);

  // Lista única de nomes do Excel e PDFs para correspondência manual
  const uniqueExcelSuppliers = useMemo(() => {
    return Array.from(new Set(excelInvoices.map((i) => i.supplierRaw))).sort();
  }, [excelInvoices]);

  const uniquePdfSuppliers = useMemo(() => {
    return Array.from(new Set(pdfInvoices.map((i) => i.supplierRaw))).sort();
  }, [pdfInvoices]);

  const displayedPdfInvoices = useMemo(() => {
    if (!pdfSearchTerm.trim()) return pdfInvoices;
    const q = pdfSearchTerm.toLowerCase();
    return pdfInvoices.filter(
      (inv) =>
        inv.supplierRaw.toLowerCase().includes(q) ||
        (inv.nif && inv.nif.includes(q)) ||
        inv.documentNumber.toLowerCase().includes(q)
    );
  }, [pdfInvoices, pdfSearchTerm]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Reconciliação de Faturas de Fornecedores
            </h1>
            <p className="text-sm text-muted-foreground">
              Cruze as faturas em Excel com as faturas lançadas na contabilidade (PDFs) e detete divergências por dia.
            </p>
          </div>
        </div>

        {/* Indicador de Passos */}
        <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-xl text-xs font-medium self-start md:self-auto">
          <button
            onClick={() => setCurrentStep(1)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 1
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1. Carregar Ficheiros
          </button>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => excelPreview && pdfInvoices.length > 0 && setCurrentStep(2)}
            disabled={!excelPreview || pdfInvoices.length === 0}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 2
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40"
            }`}
          >
            2. Mapeamento & Revisão
          </button>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => reconciliationResult && setCurrentStep(3)}
            disabled={!reconciliationResult}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 3
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40"
            }`}
          >
            3. Resultados
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* PASSO 1: CARREGAMENTO DE FICHEIROS */}
      {/* ============================================================== */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* CARD A: EXCEL DAS FATURAS E-FATURA */}
            <div className="elevated-card rounded-2xl p-6 border border-border flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base text-foreground">
                      E-fatura (Excel)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Formato .xlsx, .xls ou .csv exportado do portal e-Fatura
                    </p>
                  </div>
                </div>

                {!excelFile ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleExcelDrop}
                    className="border-2 border-dashed border-border/80 hover:border-primary/50 hover:bg-primary/5 transition-all rounded-xl p-6 text-center flex flex-col items-center justify-center cursor-pointer h-[200px] min-h-[200px]"
                    onClick={() => document.getElementById("excel-input-upload")?.click()}
                  >
                    <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">
                      Arraste o ficheiro Excel para aqui
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ou clique para selecionar do computador (.xlsx, .xls, .csv)
                    </p>
                    <input
                      id="excel-input-upload"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleExcelFileSelect(e.target.files[0]);
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileCheck className="w-8 h-8 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {excelFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(excelFile.size / 1024).toFixed(1)} KB • {excelPreview?.rawRows.length} faturas detetadas
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setExcelFile(null);
                        setExcelPreview(null);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {excelPreview && (
                <div className="mt-4 pt-4 border-t border-border/60">
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    Colunas detetadas automaticamente:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>Fornecedor: <span className="font-medium text-foreground">{columnMapping.supplierCol || "—"}</span></div>
                    <div>Nº Doc: <span className="font-medium text-foreground">{columnMapping.docNumberCol || "—"}</span></div>
                    <div>Data: <span className="font-medium text-foreground">{columnMapping.dateCol || "—"}</span></div>
                    <div>Total: <span className="font-medium text-foreground">{columnMapping.amountCol || "—"}</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* CARD B: RECONCILIAÇÃO CONTABILIDADE (PDF) */}
            <div className="elevated-card rounded-2xl p-6 border border-border flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-info/20 flex items-center justify-center text-info">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base text-foreground">
                      Reconciliação contabilidade (PDF)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Um ou múltiplos PDFs com as faturas lançadas na contabilidade
                    </p>
                  </div>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handlePdfDrop}
                  className="border-2 border-dashed border-border/80 hover:border-primary/50 hover:bg-primary/5 transition-all rounded-xl p-6 text-center flex flex-col items-center justify-center cursor-pointer h-[200px] min-h-[200px]"
                  onClick={() => document.getElementById("pdf-input-upload")?.click()}
                >
                  <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    Arraste os ficheiros PDF para aqui
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou clique para selecionar do computador (suporta seleção múltipla)
                  </p>
                  <input
                    id="pdf-input-upload"
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={handlePdfSelect}
                  />
                </div>

                {pdfFiles.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
                      <span>{pdfFiles.length} documento(s) PDF selecionado(s):</span>
                      <button
                        onClick={() => setPdfFiles([])}
                        className="text-destructive hover:underline"
                      >
                        Limpar todos
                      </button>
                    </div>
                    {pdfFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="bg-card border border-border/80 rounded-lg p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate text-foreground font-medium">{file.name}</span>
                          <span className="text-muted-foreground">
                            ({(file.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <button
                          onClick={() => removePdfFile(idx)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Barra de Progresso / Loading durante extração */}
          {isProcessing && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  {extractionProgress
                    ? `A processar PDF ${extractionProgress.currentFile} de ${extractionProgress.totalFiles} (${extractionProgress.fileName})`
                    : "A preparar documentos..."}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {extractionProgress?.percent || 0}%
                </span>
              </div>
              <Progress value={extractionProgress?.percent || 0} />
              <p className="text-xs text-muted-foreground italic">
                {extractionProgress?.stage || "A ler páginas e a extrair valores..."}
              </p>
            </div>
          )}

          {/* Botão de Ação */}
          <div className="flex justify-end pt-2">
            <Button
              size="lg"
              disabled={!excelFile || pdfFiles.length === 0 || isProcessing}
              onClick={startExtraction}
              className="gap-2 px-8 font-semibold shadow-md"
            >
              Extrair Dados & Rever <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PASSO 2: MAPEAMENTO DE COLUNAS DO EXCEL & TABELA EDITÁVEL DOS PDFS */}
      {/* ============================================================== */}
      {currentStep === 2 && (
        <div className="space-y-8 animate-fade-in">
          {/* SECÇÃO 1: MAPEAMENTO DE COLUNAS DO EXCEL */}
          <div className="elevated-card rounded-2xl p-6 border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-accent" />
                  Mapeamento de Colunas do Excel
                </h2>
                <p className="text-xs text-muted-foreground">
                  Confirme ou ajuste a correspondência entre as colunas do ficheiro Excel e os campos do sistema.
                </p>
              </div>
              <Badge variant="outline" className="text-xs bg-accent/10 border-accent/30 text-accent">
                {excelPreview?.headers.length || 0} colunas detetadas
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 pt-2">
              <div>
                <Label className="text-xs font-semibold">Fornecedor (Nome) *</Label>
                <Select
                  value={columnMapping.supplierCol}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, supplierCol: val }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Selecionar coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {excelPreview?.headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">NIF Fornecedor (Opcional)</Label>
                <Select
                  value={columnMapping.nifCol || "nenhum"}
                  onValueChange={(val) =>
                    setColumnMapping((prev) => ({
                      ...prev,
                      nifCol: val === "nenhum" ? undefined : val,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Sem coluna de NIF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum" className="text-xs">
                      -- Não incluir NIF --
                    </SelectItem>
                    {excelPreview?.headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Nº do Documento *</Label>
                <Select
                  value={columnMapping.docNumberCol}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, docNumberCol: val }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Selecionar coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {excelPreview?.headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Data da Fatura *</Label>
                <Select
                  value={columnMapping.dateCol}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, dateCol: val }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Selecionar coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {excelPreview?.headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Valor Total (€) *</Label>
                <Select
                  value={columnMapping.amountCol}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, amountCol: val }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Selecionar coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {excelPreview?.headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* SECÇÃO 2: TABELA EDITÁVEL DOS DADOS EXTRAÍDOS DOS PDFS */}
          <div className="elevated-card rounded-2xl p-6 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-info" />
                  Revisão dos Dados Extraídos dos PDFs
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pode corrigir qualquer campo antes da reconciliação. Campos a{" "}
                  <span className="text-destructive font-semibold">vermelho</span> indicam leitura com baixa confiança.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="relative w-56">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar faturas PDF..."
                    value={pdfSearchTerm}
                    onChange={(e) => setPdfSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <Badge variant="outline" className="text-xs bg-info/10 border-info/30 text-info whitespace-nowrap">
                  {pdfInvoices.length} faturas extraídas
                </Badge>
              </div>
            </div>

            <div className="border border-border rounded-xl max-h-[520px] overflow-y-auto overflow-x-auto shadow-inner">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted text-muted-foreground font-semibold border-b border-border sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-2.5 px-3 bg-muted">Origem</th>
                    <th className="py-2.5 px-3 bg-muted">Fornecedor</th>
                    <th className="py-2.5 px-3 bg-muted">NIF</th>
                    <th className="py-2.5 px-3 bg-muted">Nº Interno</th>
                    <th className="py-2.5 px-3 bg-muted">Nº Documento</th>
                    <th className="py-2.5 px-3 bg-muted">Data</th>
                    <th className="py-2.5 px-3 bg-muted">Valor (€)</th>
                    <th className="py-2.5 px-2 text-center w-12 bg-muted">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedPdfInvoices.map((inv) => {
                    const isLowConfSupplier = inv.lowConfidenceFields?.includes("supplierRaw");
                    const isLowConfDoc = inv.lowConfidenceFields?.includes("documentNumber");
                    const isLowConfDate = inv.lowConfidenceFields?.includes("date");
                    const isLowConfAmount = inv.lowConfidenceFields?.includes("amount");

                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">
                          {inv.pdfFileName} (pág. {inv.pageNumber})
                          {inv.usedOcr && (
                            <Badge className="ml-1 text-[9px] py-0 px-1 bg-warning/10 text-warning border-warning/20">
                              OCR
                            </Badge>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            value={inv.supplierRaw}
                            onChange={(e) => handleUpdatePdfInvoice(inv.id, "supplierRaw", e.target.value)}
                            className={`h-8 text-xs ${
                              isLowConfSupplier ? "border-destructive bg-destructive/5 text-destructive font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2 w-28">
                          <Input
                            value={inv.nif || ""}
                            placeholder="NIF (9 dígitos)"
                            onChange={(e) => handleUpdatePdfInvoice(inv.id, "nif", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-1.5 px-2 w-28">
                          <Input
                            value={inv.internalDocNumber || ""}
                            placeholder="Nº Int."
                            onChange={(e) => handleUpdatePdfInvoice(inv.id, "internalDocNumber", e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </td>
                        <td className="py-1.5 px-2 w-32">
                          <Input
                            value={inv.documentNumber}
                            onChange={(e) => handleUpdatePdfInvoice(inv.id, "documentNumber", e.target.value)}
                            className={`h-8 text-xs ${
                              isLowConfDoc ? "border-destructive bg-destructive/5 text-destructive font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2 w-32">
                          <Input
                            type="date"
                            value={inv.date}
                            onChange={(e) => handleUpdatePdfInvoice(inv.id, "date", e.target.value)}
                            className={`h-8 text-xs ${
                              isLowConfDate ? "border-destructive bg-destructive/5 text-destructive font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2 w-28">
                          <Input
                            type="number"
                            step="0.01"
                            value={inv.amount}
                            onChange={(e) =>
                              handleUpdatePdfInvoice(inv.id, "amount", parseFloat(e.target.value) || 0)
                            }
                            className={`h-8 text-xs text-right font-medium ${
                              isLowConfAmount ? "border-destructive bg-destructive/5 text-destructive font-semibold" : ""
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeletePdfInvoice(inv.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Remover linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECÇÃO 3: ASSOCIAÇÃO MANUAL DE FORNECEDORES (SE NECESSÁRIO) */}
          <div className="elevated-card rounded-2xl p-6 border border-border space-y-4">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Associação Manual de Fornecedores com Nomes Divergentes
              </h2>
              <p className="text-xs text-muted-foreground">
                Se um fornecedor tiver um nome diferente no Excel e na Contabilidade (e não tiver NIF), associe-os manualmente aqui.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs font-semibold">Fornecedor no Excel</Label>
                <Select
                  onValueChange={(val) => {
                    const currentTarget = (document.getElementById("pdf-target-supplier-select") as any)?.value;
                    if (currentTarget) {
                      setManualSupplierMapping((prev) => ({ ...prev, [`NAME:${val}`]: `NAME:${currentTarget}` }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Escolher do Excel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueExcelSuppliers.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Corresponde a na Contabilidade (PDF)</Label>
                <Select
                  onValueChange={(val) => {
                    toast.info(`Fornecedor selecionado: ${val}`);
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Escolher da Contabilidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uniquePdfSuppliers.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-muted-foreground italic pb-2">
                * Os fornecedores com o mesmo NIF ou com nome normalizado idêntico são associados automaticamente.
              </div>
            </div>
          </div>

          {/* BOTÕES DE NAVEGAÇÃO */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(1)}
              className="gap-2 text-xs"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar aos Ficheiros
            </Button>

            <Button
              size="lg"
              onClick={executeReconciliation}
              className="gap-2 px-8 font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <CheckCheck className="w-4 h-4" /> Reconciliar Faturas
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PASSO 3: ECRÃ DE RESULTADOS DA RECONCILIAÇÃO */}
      {/* ============================================================== */}
      {currentStep === 3 && reconciliationResult && (
        <div className="space-y-6 animate-fade-in">
          {/* CARTÕES DE RESUMO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              title="Total Fornecedores"
              value={reconciliationResult.totalSuppliers}
              icon={<Layers className="w-5 h-5 text-primary" />}
            />
            <StatCard
              title="Reconciliados"
              value={reconciliationResult.reconciledCount}
              change={`${(
                (reconciliationResult.reconciledCount /
                  (reconciliationResult.totalSuppliers || 1)) *
                100
              ).toFixed(0)}% do total`}
              changeType="positive"
              icon={<CheckCircle2 className="w-5 h-5 text-success" />}
            />
            <StatCard
              title="Parcialmente"
              value={reconciliationResult.partiallyReconciledCount}
              changeType="neutral"
              icon={<AlertTriangle className="w-5 h-5 text-warning" />}
            />
            <StatCard
              title="Não Reconciliados"
              value={reconciliationResult.notReconciledCount}
              changeType="negative"
              icon={<AlertCircle className="w-5 h-5 text-destructive" />}
            />
            <StatCard
              title="Diferença Total"
              value={`${reconciliationResult.totalDifference.toLocaleString("pt-PT", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} €`}
              changeType={reconciliationResult.totalDifference === 0 ? "positive" : "negative"}
              icon={<Scale className="w-5 h-5 text-accent" />}
            />
          </div>

          {/* BANNER DESTAQUE: EXPORTAÇÃO E-FATURA PINTADO A VERDE + FOLHA SÓ CONTABILIDADE */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/25 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-inner">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    Excel e-Fatura Reconciliado (com Folha de Faturas Só na Contabilidade)
                  </h3>
                  <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30 font-semibold text-xs">
                    {reconciledExcelCount} de {totalExcelCount} reconciliadas (
                    {totalExcelCount > 0 ? Math.round((reconciledExcelCount / totalExcelCount) * 100) : 0}%)
                  </Badge>
                  {unreconciledPdfCount > 0 && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold text-xs">
                      {unreconciledPdfCount} faturas ausentes no e-Fatura
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                  Gera o Excel em 2 folhas: <strong>Folha 1 (e-Fatura)</strong> com todas as colunas originais e linhas reconciliadas pintadas a verde; e <strong>Folha 2 (Não no e-Fatura)</strong> com as faturas lançadas na contabilidade que não constam no e-Fatura para validação se pertencem à empresa.
                </p>
              </div>
            </div>
            <Button
              onClick={handleExportOriginalPainted}
              disabled={isExportingPainted}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-md hover:shadow-lg transition-all h-10 px-4 self-start md:self-auto whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              {isExportingPainted ? "A Gerar Excel..." : "Descarregar Excel Reconciliado (.xlsx)"}
            </Button>
          </div>

          {/* BARRA DE AÇÕES E FILTROS */}
          <div className="elevated-card rounded-2xl p-4 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Pesquisa e Filtros */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar fornecedor ou NIF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setStatusFilter("todos")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    statusFilter === "todos"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos ({reconciliationResult.totalSuppliers})
                </button>
                <button
                  onClick={() => setStatusFilter("nao_reconciliado")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    statusFilter === "nao_reconciliado"
                      ? "bg-card text-destructive shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Não Reconciliados ({reconciliationResult.notReconciledCount})
                </button>
                <button
                  onClick={() => setStatusFilter("parcialmente_reconciliado")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    statusFilter === "parcialmente_reconciliado"
                      ? "bg-card text-warning shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Parciais ({reconciliationResult.partiallyReconciledCount})
                </button>
                <button
                  onClick={() => setStatusFilter("reconciliado")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    statusFilter === "reconciliado"
                      ? "bg-card text-success shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reconciliados ({reconciliationResult.reconciledCount})
                </button>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(2)}
                className="gap-2 text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Rever Dados
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportReconciliationToExcel(reconciliationResult)}
                className="gap-2 text-xs border-border hover:bg-muted"
              >
                <Download className="w-3.5 h-3.5" /> Relatório Resumo (.xlsx)
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleExportOriginalPainted}
                disabled={isExportingPainted}
                className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> e-Fatura a Verde (.xlsx)
              </Button>
            </div>
          </div>

          {/* TABELA DE FORNECEDORES */}
          <div className="elevated-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Fornecedor</th>
                    <th className="py-3 px-3">NIF</th>
                    <th className="py-3 px-3 text-right">Total Excel</th>
                    <th className="py-3 px-3 text-right">Total Contabilidade</th>
                    <th className="py-3 px-3 text-right">Diferença</th>
                    <th className="py-3 px-3 text-center">Faturas (Excel / PDF)</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        Nenhum fornecedor encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => {
                      const isReconciled = supplier.status === "reconciliado";
                      const isPartial = supplier.status === "parcialmente_reconciliado";
                      const isNotReconciled = supplier.status === "nao_reconciliado";

                      return (
                        <tr
                          key={supplier.supplierKey}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedSupplierDetail(supplier)}
                        >
                          <td className="py-3 px-4 font-medium text-foreground">
                            {supplier.supplierName}
                          </td>
                          <td className="py-3 px-3 text-muted-foreground font-mono">
                            {supplier.nif || "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-medium">
                            {supplier.totalExcel.toLocaleString("pt-PT", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            €
                          </td>
                          <td className="py-3 px-3 text-right font-medium">
                            {supplier.totalPdf.toLocaleString("pt-PT", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            €
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-bold ${
                              supplier.difference === 0
                                ? "text-success"
                                : "text-destructive"
                            }`}
                          >
                            {supplier.difference > 0 ? "+" : ""}
                            {supplier.difference.toLocaleString("pt-PT", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            €
                          </td>
                          <td className="py-3 px-3 text-center text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {supplier.excelInvoicesCount}
                            </span>{" "}
                            /{" "}
                            <span className="font-semibold text-foreground">
                              {supplier.pdfInvoicesCount}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isReconciled && (
                              <Badge className="bg-success/15 text-success hover:bg-success/20 border-success/30 font-medium">
                                Reconciliado
                              </Badge>
                            )}
                            {isPartial && (
                              <Badge className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30 font-medium">
                                Parcialmente
                              </Badge>
                            )}
                            {isNotReconciled && (
                              <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30 font-medium">
                                Não Reconciliado
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSupplierDetail(supplier);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" /> Detalhe por Dia
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DIÁLOGO DE DETALHE POR DIA (LADO A LADO) */}
      {/* ============================================================== */}
      <Dialog
        open={!!selectedSupplierDetail}
        onOpenChange={(open) => !open && setSelectedSupplierDetail(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedSupplierDetail && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      {selectedSupplierDetail.supplierName}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1">
                      {selectedSupplierDetail.nif ? `NIF: ${selectedSupplierDetail.nif} • ` : ""}
                      Reconciliação detalhada dia a dia
                    </DialogDescription>
                  </div>
                  <div>
                    {selectedSupplierDetail.status === "reconciliado" && (
                      <Badge className="bg-success/15 text-success border-success/30">
                        100% Reconciliado
                      </Badge>
                    )}
                    {selectedSupplierDetail.status === "parcialmente_reconciliado" && (
                      <Badge className="bg-warning/15 text-warning border-warning/30">
                        Reconciliado Parcialmente
                      </Badge>
                    )}
                    {selectedSupplierDetail.status === "nao_reconciliado" && (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30">
                        Não Reconciliado
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Métricas rápidas do fornecedor */}
              <div className="grid grid-cols-3 gap-3 bg-muted/40 p-3 rounded-xl border border-border text-center text-xs">
                <div>
                  <span className="text-muted-foreground">Total no Excel:</span>
                  <p className="text-sm font-bold text-foreground">
                    {selectedSupplierDetail.totalExcel.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Contabilidade:</span>
                  <p className="text-sm font-bold text-foreground">
                    {selectedSupplierDetail.totalPdf.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Diferença:</span>
                  <p
                    className={`text-sm font-bold ${
                      selectedSupplierDetail.difference === 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {selectedSupplierDetail.difference > 0 ? "+" : ""}
                    {selectedSupplierDetail.difference.toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </p>
                </div>
              </div>

              {/* LISTA DE DIAS COM DIFERENÇAS */}
              {selectedSupplierDetail.dayDiscrepancies.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-warning" />
                    Dias com Divergência ({selectedSupplierDetail.dayDiscrepancies.length})
                  </h3>

                  <div className="space-y-3">
                    {selectedSupplierDetail.dayDiscrepancies.map((day) => (
                      <div
                        key={day.date}
                        className="border border-border/80 rounded-xl p-4 bg-card/60 shadow-sm space-y-3"
                      >
                        {/* Cabeçalho do dia */}
                        <div className="flex items-center justify-between pb-2 border-b border-border/60 text-xs">
                          <div className="flex items-center gap-2 font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Data: {day.date}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span>
                              Excel: <strong>{day.totalExcel.toFixed(2)} €</strong>
                            </span>
                            <span>
                              Contab: <strong>{day.totalPdf.toFixed(2)} €</strong>
                            </span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded ${
                                day.difference === 0
                                  ? "bg-success/10 text-success"
                                  : "bg-destructive/10 text-destructive"
                              }`}
                            >
                              Diferença: {day.difference > 0 ? "+" : ""}
                              {day.difference.toFixed(2)} €
                            </span>
                          </div>
                        </div>

                        {/* Comparação Lado a Lado de Faturas do dia */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Lado Esquerdo: Faturas Excel */}
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                            <p className="font-semibold text-foreground mb-2 flex items-center justify-between">
                              <span>Faturas no Excel ({day.excelInvoices.length})</span>
                              <span className="font-mono text-xs">{day.totalExcel.toFixed(2)} €</span>
                            </p>
                            {day.excelInvoices.length === 0 ? (
                              <p className="text-muted-foreground italic text-[11px]">
                                Nenhuma fatura registada no Excel para este dia.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {day.excelInvoices.map((inv) => (
                                  <li
                                    key={inv.id}
                                    className="flex items-center justify-between py-1 border-b border-border/30 last:border-0"
                                  >
                                    <span className="text-foreground">{inv.documentNumber}</span>
                                    <span className="font-mono font-medium">
                                      {inv.amount.toFixed(2)} €
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Lado Direito: Faturas Contabilidade (PDF) */}
                          <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                            <p className="font-semibold text-foreground mb-2 flex items-center justify-between">
                              <span>Faturas na Contabilidade ({day.pdfInvoices.length})</span>
                              <span className="font-mono text-xs">{day.totalPdf.toFixed(2)} €</span>
                            </p>
                            {day.pdfInvoices.length === 0 ? (
                              <p className="text-muted-foreground italic text-[11px]">
                                Nenhuma fatura lançada na Contabilidade para este dia.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {day.pdfInvoices.map((inv) => (
                                  <li
                                    key={inv.id}
                                    className="flex items-center justify-between py-1 border-b border-border/30 last:border-0"
                                  >
                                    <span className="text-foreground">
                                      {inv.documentNumber}
                                      {inv.internalDocNumber && (
                                        <span className="text-muted-foreground ml-1.5 text-[10px] font-mono">
                                          (Nº Int: {inv.internalDocNumber})
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono font-medium">
                                      {inv.amount.toFixed(2)} €
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-success/5 border border-success/20 rounded-xl space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
                  <p className="text-sm font-semibold text-success">
                    Todas as faturas e dias deste fornecedor coincidem a 100%!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Os totais de todas as faturas são idênticos dentro da tolerância de cêntimos.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedSupplierDetail(null)}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
