import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Download,
  Upload,
  Calendar,
  Building2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  FileCode,
  Layers,
  ArrowRight,
  TrendingUp,
  Receipt,
  FileCheck,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchClients, type Client } from "@/lib/clientes";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ExtractedInvoice {
  uid: string;
  nifEmitente: string;
  nomeEmitente: string;
  nifAdquirente: string;
  nomeAdquirente: string;
  tipoDocumento: string;
  numeroDocumento: string;
  dataEmissao: string;
  baseTributavel: number;
  totalIva: number;
  totalDocumento: number;
  situacao?: string;
  origemFicheiro?: string;
}

const EFaturaPage = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("manual");
  const [nifEmpresa, setNifEmpresa] = useState<string>("");
  const [nomeEmpresa, setNomeEmpresa] = useState<string>("");

  // Configuracao da Extracao
  const [tipoMovimento, setTipoMovimento] = useState<"compras" | "vendas">("compras");
  const [ano, setAno] = useState<string>("2025");
  const [dataInicio, setDataInicio] = useState<string>("2025-01-01");
  const [dataFim, setDataFim] = useState<string>("2025-12-31");
  const [intervaloDias, setIntervaloDias] = useState<number>(7);

  // Estado do Consolidador
  const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
  const [processedFiles, setProcessedFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 15;
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClients().then((data) => {
      setClients(data);
    });
  }, []);

  // Apenas Admin e Colaborador podem aceder
  if (user?.role === "cliente") {
    return <Navigate to="/portal" replace />;
  }

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    if (clientId === "manual") {
      setNifEmpresa("");
      setNomeEmpresa("");
    } else {
      const client = clients.find((c) => c.id === clientId);
      if (client) {
        setNifEmpresa(client.nif || "");
        setNomeEmpresa(client.nome || "");
      }
    }
  };

  const handleAnoChange = (selectedAno: string) => {
    setAno(selectedAno);
    setDataInicio(`${selectedAno}-01-01`);
    setDataFim(`${selectedAno}-12-31`);
  };

  const calcularNumeroLotes = () => {
    try {
      const start = new Date(dataInicio);
      const end = new Date(dataFim);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return Math.ceil(diffDays / intervaloDias);
    } catch {
      return 0;
    }
  };

  const getPythonScriptCode = () => {
    return `import os
import sys
import time
import argparse
from datetime import datetime, timedelta

# Extrator em Lote do e-Fatura AT (Gerado por Interconta)
# Configuracao: ${tipoMovimento.toUpperCase()} | ${dataInicio} a ${dataFim} | Lotes de ${intervaloDias} dias
def run():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        import subprocess
        print("A instalar playwright e dependencias...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "pandas", "openpyxl"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    tipo = "${tipoMovimento}"
    start_date = datetime.strptime("${dataInicio}", "%Y-%m-%d")
    end_date = datetime.strptime("${dataFim}", "%Y-%m-%d")
    delta = timedelta(days=${intervaloDias})
    nif = "${nifEmpresa}"
    
    out_dir = os.path.abspath("./downloads_efatura")
    os.makedirs(out_dir, exist_ok=True)
    
    print("=" * 60)
    print("  INTERCONTA - EXTRATOR EM LOTE DO E-FATURA")
    print(f"  Tipo: {tipo.upper()} | NIF: {nif or 'Nao especificado'}")
    print(f"  Periodo: {start_date.strftime('%d/%m/%Y')} a {end_date.strftime('%d/%m/%Y')}")
    print("=" * 60)

    downloaded = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # Login no Portal das Financas
        page.goto("https://www.acesso.gov.pt/v2/login?skin=efatura")
        print("\\nEfetue o login no browser com Senha AT ou Chave Movel Digital...")
        
        # Aguardar conclusao do login
        for _ in range(120):
            if "portaldasfinancas.gov.pt" in page.url.lower() and "login" not in page.url.lower():
                break
            time.sleep(1)
            
        target_url = "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action" if tipo == "compras" \\
            else "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosEmitente.action"
            
        page.goto(target_url)
        time.sleep(2)

        cur_start = start_date
        while cur_start <= end_date:
            cur_end = min(cur_start + delta - timedelta(days=1), end_date)
            s_str = cur_start.strftime("%Y-%m-%d")
            e_str = cur_end.strftime("%Y-%m-%d")
            
            print(f"A extrair lote: {cur_start.strftime('%d-%m-%Y')} ate {cur_end.strftime('%d-%m-%Y')}...")
            try:
                for sel in ["#dataInicio", "input[name='dataInicio']", "#dataEmissaoInicio"]:
                    if page.locator(sel).count() > 0 and page.locator(sel).is_visible():
                        page.fill(sel, s_str)
                        break
                for sel in ["#dataFim", "input[name='dataFim']", "#dataEmissaoFim"]:
                    if page.locator(sel).count() > 0 and page.locator(sel).is_visible():
                        page.fill(sel, e_str)
                        break
                
                for btn in ["button:has-text('Pesquisar')", "input[value='Pesquisar']", "#pesquisarBtn"]:
                    if page.locator(btn).count() > 0 and page.locator(btn).is_visible():
                        page.click(btn)
                        break
                time.sleep(2)
                
                # Exportar
                for exp in ["a:has-text('Exportar')", "button:has-text('Exportar')", ".btn-export"]:
                    if page.locator(exp).count() > 0 and page.locator(exp).is_visible():
                        with page.expect_download(timeout=10000) as dl:
                            page.click(exp)
                        d = dl.value
                        fname = f"faturas_{tipo}_{s_str}_{e_str}" + os.path.splitext(d.suggested_filename)[1]
                        dest = os.path.join(out_dir, fname)
                        d.save_as(dest)
                        downloaded.append(dest)
                        print(f"  [OK] Guardado: {fname}")
                        break
            except Exception as ex:
                print(f"  [Aviso] Falha no lote: {ex}")
                
            cur_start = cur_end + timedelta(days=1)
            time.sleep(1.5)

        browser.close()
        
    print(f"\\nConcluido! Foram descarregados {len(downloaded)} ficheiros para {out_dir}")

if __name__ == "__main__":
    run()
`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getPythonScriptCode());
    toast.success("Código Python copiado para a área de transferência!");
  };

  const handleDownloadPythonScript = () => {
    const code = getPythonScriptCode();
    const blob = new Blob([code], { type: "text/x-python;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `extrator_efatura_${tipoMovimento}_${nifEmpresa || "empresa"}_${ano}.py`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Ficheiro Python descarregado com sucesso!");
  };

  const handleDownloadBat = () => {
    const batContent = `@echo off
chcp 65001 >nul
title Interconta - Extrator e-Fatura AT
echo =========================================================
echo       INTERCONTA - EXTRATOR EM LOTE DO E-FATURA
echo =========================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O Python nao esta instalado no sistema.
    echo Por favor instale o Python em https://www.python.org marcando "Add to PATH".
    pause
    exit /b 1
)

echo A verificar dependencias do Playwright...
pip install playwright pandas openpyxl >nul 2>&1
python -m playwright install chromium >nul 2>&1

echo.
echo A iniciar extrator para ${tipoMovimento.toUpperCase()} (${dataInicio} a ${dataFim})...
python "extrator_efatura_${tipoMovimento}_${nifEmpresa || "empresa"}_${ano}.py"

echo.
echo =========================================================
echo  Extração finalizada com sucesso!
echo =========================================================
pause
`;
    const blob = new Blob([batContent], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `executar_extracao_${tipoMovimento}.bat`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Ficheiro .bat descarregado!");
  };

  // Parser dos ficheiros descarregados do e-fatura
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newInvoices: ExtractedInvoice[] = [];
    const newFileNames: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        newFileNames.push(file.name);
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

        if (!jsonData || jsonData.length < 2) continue;

        // Tentar localizar a linha de cabeçalho
        let headerRowIndex = -1;
        for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
          const row = jsonData[r];
          if (!row) continue;
          const rowStr = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
          if (
            rowStr.includes("documento") ||
            rowStr.includes("emissão") ||
            rowStr.includes("emissao") ||
            rowStr.includes("adquirente") ||
            rowStr.includes("emitente")
          ) {
            headerRowIndex = r;
            break;
          }
        }

        if (headerRowIndex === -1) headerRowIndex = 0;

        const headers = (jsonData[headerRowIndex] ?? []).map((h) =>
          String(h ?? "").trim().toLowerCase()
        );

        // Mapear colunas
        const findCol = (keywords: string[]) =>
          headers.findIndex((h) => keywords.some((k) => h.includes(k)));

        const colNifEmitente = findCol(["nif emitente", "nif do emitente", "emitente"]);
        const colNomeEmitente = findCol(["nome emitente", "nome do emitente", "designação emitente"]);
        const colNifAdquirente = findCol(["nif adquirente", "nif do adquirente", "adquirente"]);
        const colNomeAdquirente = findCol(["nome adquirente", "designação adquirente"]);
        const colNumDoc = findCol(["número do documento", "numero documento", "documento", "número"]);
        const colTipoDoc = findCol(["tipo", "tipo documento", "tipo de documento"]);
        const colData = findCol(["data de emissão", "data emissão", "data emissao", "data"]);
        const colBase = findCol(["base tributável", "base tributavel", "incidência", "incidencia"]);
        const colIva = findCol(["valor do iva", "total iva", "iva", "imposto"]);
        const colTotal = findCol(["total", "total documento", "valor total"]);
        const colSituacao = findCol(["situação", "situacao", "estado"]);

        for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
          const row = jsonData[r];
          if (!row || row.length === 0) continue;

          const numDoc = colNumDoc !== -1 ? String(row[colNumDoc] ?? "").trim() : "";
          const nifEmit = colNifEmitente !== -1 ? String(row[colNifEmitente] ?? "").trim() : "";
          const dataEmissao = colData !== -1 ? String(row[colData] ?? "").trim() : "";

          if (!numDoc && !nifEmit) continue;

          const parseNum = (val: unknown) => {
            if (typeof val === "number") return val;
            if (!val) return 0;
            const clean = String(val).replace(/\s/g, "").replace(",", ".");
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? 0 : parsed;
          };

          const baseTributavel = colBase !== -1 ? parseNum(row[colBase]) : 0;
          const totalIva = colIva !== -1 ? parseNum(row[colIva]) : 0;
          const totalDoc = colTotal !== -1 ? parseNum(row[colTotal]) : baseTributavel + totalIva;

          const uid = `${nifEmit}_${numDoc}_${dataEmissao}`;

          newInvoices.push({
            uid,
            nifEmitente: nifEmit,
            nomeEmitente: colNomeEmitente !== -1 ? String(row[colNomeEmitente] ?? "").trim() : "",
            nifAdquirente: colNifAdquirente !== -1 ? String(row[colNifAdquirente] ?? "").trim() : "",
            nomeAdquirente: colNomeAdquirente !== -1 ? String(row[colNomeAdquirente] ?? "").trim() : "",
            tipoDocumento: colTipoDoc !== -1 ? String(row[colTipoDoc] ?? "").trim() : "Fatura",
            numeroDocumento: numDoc,
            dataEmissao: dataEmissao,
            baseTributavel: baseTributavel,
            totalIva: totalIva,
            totalDocumento: totalDoc,
            situacao: colSituacao !== -1 ? String(row[colSituacao] ?? "").trim() : "Certificado",
            origemFicheiro: file.name,
          });
        }
      }

      // Remover duplicados pelo UID
      const deduplicatedMap = new Map<string, ExtractedInvoice>();
      // Manter os já existentes
      invoices.forEach((inv) => deduplicatedMap.set(inv.uid, inv));
      // Inserir os novos
      newInvoices.forEach((inv) => deduplicatedMap.set(inv.uid, inv));

      const consolidatedList = Array.from(deduplicatedMap.values());
      const novosAdicionados = consolidatedList.length - invoices.length;

      setInvoices(consolidatedList);
      setProcessedFiles((prev) => Array.from(new Set([...prev, ...newFileNames])));

      toast.success(
        `Processamento concluído! ${newFileNames.length} ficheiros lidos. Total consolidado: ${consolidatedList.length} faturas (${novosAdicionados} novas adicionadas).`
      );
    } catch (err: unknown) {
      console.error("Erro ao processar ficheiros:", err);
      const errMsg = err instanceof Error ? err.message : "Formato não suportado";
      toast.error(`Erro ao ler ficheiros: ${errMsg}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleExportConsolidatedExcel = () => {
    if (invoices.length === 0) {
      toast.error("Não existem faturas para exportar.");
      return;
    }

    const excelData = invoices.map((inv) => ({
      "NIF Emitente": inv.nifEmitente,
      "Nome Emitente": inv.nomeEmitente,
      "NIF Adquirente": inv.nifAdquirente,
      "Nome Adquirente": inv.nomeAdquirente,
      "Tipo Documento": inv.tipoDocumento,
      "Número Documento": inv.numeroDocumento,
      "Data Emissão": inv.dataEmissao,
      "Base Tributável (€)": inv.baseTributavel,
      "Total IVA (€)": inv.totalIva,
      "Total Documento (€)": inv.totalDocumento,
      "Situação": inv.situacao || "Válido",
      "Ficheiro de Origem": inv.origemFicheiro || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Faturas Consolidadas");

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 14 },
      { wch: 28 },
      { wch: 14 },
      { wch: 28 },
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 24 },
    ];
    worksheet["!cols"] = colWidths;

    const exportFileName = `CONSOLIDADO_EFATURA_${tipoMovimento.toUpperCase()}_${nifEmpresa || "GERAL"}_${ano}.xlsx`;
    XLSX.writeFile(workbook, exportFileName);
    toast.success(`Ficheiro Excel descarregado: ${exportFileName}`);
  };

  // Estatísticas calculadas
  const totalFaturas = invoices.length;
  const totalBase = invoices.reduce((acc, curr) => acc + (curr.baseTributavel || 0), 0);
  const totalIva = invoices.reduce((acc, curr) => acc + (curr.totalIva || 0), 0);
  const totalGeral = invoices.reduce((acc, curr) => acc + (curr.totalDocumento || 0), 0);

  // Filtragem
  const filteredInvoices = invoices.filter((inv) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      inv.nomeEmitente.toLowerCase().includes(q) ||
      inv.nifEmitente.toLowerCase().includes(q) ||
      inv.nomeAdquirente.toLowerCase().includes(q) ||
      inv.nifAdquirente.toLowerCase().includes(q) ||
      inv.numeroDocumento.toLowerCase().includes(q) ||
      inv.tipoDocumento.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex flex-col h-full space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5 bg-card/50 p-5 rounded-xl border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">Extrator & Consolidador e-Fatura</h1>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/30 text-xs">
                Portal AT (Portugal)
              </Badge>
              <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                Anti-Bloqueio 300 docs
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Extração em lote de faturas de compras ou vendas por períodos semanais e consolidação num único ficheiro Excel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoices.length > 0 && (
            <Button
              onClick={handleExportConsolidatedExcel}
              className="gap-2 shadow-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar Excel Consolidado ({invoices.length})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="extrator" className="w-full space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-xl h-11 bg-muted/60 p-1 border">
          <TabsTrigger value="extrator" className="flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Configurar Extração
          </TabsTrigger>
          <TabsTrigger value="consolidador" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Consolidador ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="script" className="flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            Script Playwright
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Configurar Extração em Lote */}
        <TabsContent value="extrator" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda: Definições */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" />
                    Parâmetros do Lote e-Fatura
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure os documentos a extrair e o período. Os lotes fragmentados contornam o teto oficial de 300 documentos da AT.
                  </p>
                </div>

                {/* Tipo de Documento */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Tipo de Documentos Pretendidos</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      onClick={() => setTipoMovimento("compras")}
                      className={`cursor-pointer rounded-lg border-2 p-4 flex flex-col gap-1 transition-all ${
                        tipoMovimento === "compras"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">
                          Compras (Adquirente)
                        </span>
                        {tipoMovimento === "compras" && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Faturas de fornecedores recebidas com o NIF da empresa
                      </span>
                    </div>

                    <div
                      onClick={() => setTipoMovimento("vendas")}
                      className={`cursor-pointer rounded-lg border-2 p-4 flex flex-col gap-1 transition-all ${
                        tipoMovimento === "vendas"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">
                          Vendas (Emitente)
                        </span>
                        {tipoMovimento === "vendas" && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Faturas e notas de crédito emitidas aos clientes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selecionar Cliente do Interconta */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Empresa / Cliente do Interconta</Label>
                  <Select value={selectedClientId} onValueChange={handleClientChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">-- Inserir NIF Manualmente --</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {c.nif ? `(${c.nif})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">NIF da Empresa</Label>
                    <Input
                      placeholder="Ex: 509123456"
                      value={nifEmpresa}
                      onChange={(e) => setNifEmpresa(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Nome / Razão Social</Label>
                    <Input
                      placeholder="Ex: Empresa Exemplo, Lda"
                      value={nomeEmpresa}
                      onChange={(e) => setNomeEmpresa(e.target.value)}
                    />
                  </div>
                </div>

                {/* Período */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Intervalo de Datas</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={ano === "2026" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleAnoChange("2026")}
                      >
                        Ano 2026
                      </Button>
                      <Button
                        type="button"
                        variant={ano === "2025" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleAnoChange("2025")}
                      >
                        Ano 2025
                      </Button>
                      <Button
                        type="button"
                        variant={ano === "2024" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleAnoChange("2024")}
                      >
                        Ano 2024
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Data Início</Label>
                      <Input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Data Fim</Label>
                      <Input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Fragmentação de Lote */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Estratégia de Fragmentação (Anti-Limite AT)</Label>
                      <p className="text-xs text-muted-foreground">
                        A AT bloqueia exportações superiores a 300 documentos por pedido
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs border-success/30 text-success bg-success/5">
                      Recomendado: 7 Dias
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { dias: 7, label: "Semanal (7d)" },
                      { dias: 15, label: "Quinzenal (15d)" },
                      { dias: 30, label: "Mensal (30d)" },
                      { dias: 1, label: "Diário (1d)" },
                    ].map((opt) => (
                      <Button
                        key={opt.dias}
                        type="button"
                        variant={intervaloDias === opt.dias ? "default" : "outline"}
                        className="h-9 text-xs"
                        onClick={() => setIntervaloDias(opt.dias)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Direita: Painel de Lançamento */}
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Resumo da Extração</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Parâmetros validados para o extrator Playwright
                  </p>
                </div>

                <div className="space-y-3 bg-muted/40 p-4 rounded-lg text-xs space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo de Faturas:</span>
                    <span className="font-semibold capitalize text-foreground">{tipoMovimento}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Empresa:</span>
                    <span className="font-semibold text-foreground truncate max-w-[150px]">
                      {nomeEmpresa || (nifEmpresa ? `NIF ${nifEmpresa}` : "Geral")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Período:</span>
                    <span className="font-semibold text-foreground">
                      {dataInicio} a {dataFim}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Janela por lote:</span>
                    <span className="font-semibold text-foreground">{intervaloDias} dias</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Lotes calculados:</span>
                    <Badge variant="secondary" className="font-bold">
                      {calcularNumeroLotes()} lotes
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleDownloadBat}
                    className="w-full gap-2 shadow-sm font-semibold"
                    size="lg"
                  >
                    <Download className="w-4 h-4" />
                    Descarregar Executável (.bat)
                  </Button>

                  <Button
                    onClick={handleDownloadPythonScript}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <FileCode className="w-4 h-4" />
                    Descarregar Script Python (.py)
                  </Button>

                  <Button
                    onClick={handleCopyCode}
                    variant="ghost"
                    className="w-full gap-2 text-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Código do Script
                  </Button>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    O login é 100% assistido e seguro: abre a janela oficial da AT no seu computador para autenticar com Senha AT ou Chave Móvel Digital.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: Consolidador de Faturas */}
        <TabsContent value="consolidador" className="space-y-6">
          {/* Métricas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Faturas</p>
                <h3 className="text-xl font-bold text-foreground">{totalFaturas}</h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Base Tributável</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalBase.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total IVA</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalIva.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Líquido c/ IVA</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalGeral.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>
          </div>

          {/* Zona de Drop / Upload */}
          <div className="bg-card border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-8 text-center space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Carregar Ficheiros do e-Fatura (.xlsx, .xls, .csv)
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Arraste todos os ficheiros semanais ou mensais exportados pelo e-Fatura. A ferramenta remove automaticamente duplicados e junta tudo num único relatório.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isProcessing ? "A processar..." : "Selecionar Ficheiros em Lote"}
              </Button>
              {invoices.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvoices([]);
                    setProcessedFiles([]);
                    toast.info("Lista de faturas limpa.");
                  }}
                >
                  Limpar Dados
                </Button>
              )}
            </div>

            {processedFiles.length > 0 && (
              <div className="pt-2 text-xs text-muted-foreground">
                Ficheiros processados ({processedFiles.length}):{" "}
                <span className="font-mono text-foreground">{processedFiles.slice(0, 4).join(", ")}</span>
                {processedFiles.length > 4 && ` e mais ${processedFiles.length - 4} ficheiros...`}
              </div>
            )}
          </div>

          {/* Tabela de Faturas */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm space-y-4 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative w-full max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por NIF, Nome, Documento..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {invoices.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportConsolidatedExcel}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descarregar Excel Consolidado
                  </Button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider border-y">
                  <tr>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Nº Documento</th>
                    <th className="py-2.5 px-3">Emitente (Fornecedor)</th>
                    <th className="py-2.5 px-3">Adquirente (Cliente)</th>
                    <th className="py-2.5 px-3 text-right">Base (€)</th>
                    <th className="py-2.5 px-3 text-right">IVA (€)</th>
                    <th className="py-2.5 px-3 text-right">Total (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        {invoices.length === 0
                          ? "Nenhum ficheiro carregado ainda. Utilize o botão acima para carregar ficheiros do e-Fatura."
                          : "Nenhuma fatura encontrada com os filtros atuais."}
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((inv) => (
                      <tr key={inv.uid} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">
                          {inv.dataEmissao}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                            {inv.tipoDocumento}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground whitespace-nowrap">
                          {inv.numeroDocumento}
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate" title={`${inv.nomeEmitente} (${inv.nifEmitente})`}>
                          <div className="font-medium text-foreground truncate">{inv.nomeEmitente || inv.nifEmitente}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{inv.nifEmitente}</div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate" title={`${inv.nomeAdquirente} (${inv.nifAdquirente})`}>
                          <div className="font-medium text-foreground truncate">{inv.nomeAdquirente || inv.nifAdquirente}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{inv.nifAdquirente}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {inv.baseTributavel.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {inv.totalIva.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                          {inv.totalDocumento.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
                <div>
                  Mostrando {(currentPage - 1) * itemsPerPage + 1} a{" "}
                  {Math.min(currentPage * itemsPerPage, filteredInvoices.length)} de {filteredInvoices.length} faturas
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="px-2 font-medium text-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Seguinte
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: Script & Assistente Playwright */}
        <TabsContent value="script" className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-primary" />
                  Script de Automação Playwright (Python)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Script pronto a correr no seu computador, baseado na sua configuração atual de {tipoMovimento} ({ano})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyCode} className="gap-1.5 text-xs">
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Código
                </Button>
                <Button size="sm" onClick={handleDownloadPythonScript} className="gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  Descarregar .py
                </Button>
              </div>
            </div>

            {/* Passo a Passo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">1</span>
                  Descarregar
                </div>
                <p className="text-muted-foreground">
                  Descarregue o ficheiro <code>.py</code> ou o ficheiro <code>.bat</code> para a sua pasta de trabalho.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">2</span>
                  Executar & Autenticar
                </div>
                <p className="text-muted-foreground">
                  Dê duplo clique no <code>.bat</code>. O navegador abrirá na página oficial da AT para autenticar-se.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">3</span>
                  Consolidação
                </div>
                <p className="text-muted-foreground">
                  O script descarrega todos os lotes e consolida tudo num único ficheiro Excel limpo e pronto a usar.
                </p>
              </div>
            </div>

            {/* Code Block */}
            <div className="relative rounded-lg overflow-hidden border border-border bg-muted/40">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b border-border text-[11px] text-muted-foreground font-mono">
                <span>extrator_efatura_{tipoMovimento}.py</span>
                <span className="text-primary font-semibold">Playwright + Sync API</span>
              </div>
              <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[400px]">
                <code>{getPythonScriptCode()}</code>
              </pre>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EFaturaPage;
