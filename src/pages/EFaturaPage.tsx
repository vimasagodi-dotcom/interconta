import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  Copy,
  FileCode,
  Layers,
  TrendingUp,
  Receipt,
  FileCheck,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Sliders,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  DownloadCloud,
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
  const [senhaAt, setSenhaAt] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

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

  const handleOpenEfaturaPortal = () => {
    window.open("https://www.acesso.gov.pt/v2/login?skin=efatura", "_blank");
    toast.info("A abrir o Portal das Finanças / e-Fatura numa nova janela...");
  };

  const loadDemoInvoices = () => {
    const demoData: ExtractedInvoice[] = [
      {
        uid: "500000001_FT2025/1_2025-01-15",
        nifEmitente: "501234567",
        nomeEmitente: "EDP Comercial, S.A.",
        nifAdquirente: nifEmpresa || "508433797",
        nomeAdquirente: nomeEmpresa || "Interconta Gestão Lda",
        tipoDocumento: "Fatura",
        numeroDocumento: "FT EDP/2025/10492",
        dataEmissao: "2025-01-15",
        baseTributavel: 245.5,
        totalIva: 56.47,
        totalDocumento: 301.97,
        situacao: "Certificado",
        origemFicheiro: "demo_compras_janeiro.xlsx",
      },
      {
        uid: "500000002_FT2025/2_2025-01-20",
        nifEmitente: "502345678",
        nomeEmitente: "MEO - Serviços de Comunicações, S.A.",
        nifAdquirente: nifEmpresa || "508433797",
        nomeAdquirente: nomeEmpresa || "Interconta Gestão Lda",
        tipoDocumento: "Fatura",
        numeroDocumento: "FT MEO/9821034",
        dataEmissao: "2025-01-20",
        baseTributavel: 89.9,
        totalIva: 20.68,
        totalDocumento: 110.58,
        situacao: "Certificado",
        origemFicheiro: "demo_compras_janeiro.xlsx",
      },
      {
        uid: "500000003_FT2025/3_2025-02-05",
        nifEmitente: "503456789",
        nomeEmitente: "Staples Portugal, Lda",
        nifAdquirente: nifEmpresa || "508433797",
        nomeAdquirente: nomeEmpresa || "Interconta Gestão Lda",
        tipoDocumento: "Fatura-Recibo",
        numeroDocumento: "FR STP/5502",
        dataEmissao: "2025-02-05",
        baseTributavel: 130.0,
        totalIva: 29.9,
        totalDocumento: 159.9,
        situacao: "Certificado",
        origemFicheiro: "demo_compras_fevereiro.xlsx",
      },
      {
        uid: "500000004_FT2025/4_2025-02-28",
        nifEmitente: "504567890",
        nomeEmitente: "Galp Power, S.A.",
        nifAdquirente: nifEmpresa || "508433797",
        nomeAdquirente: nomeEmpresa || "Interconta Gestão Lda",
        tipoDocumento: "Fatura",
        numeroDocumento: "FT GLP/2025/4412",
        dataEmissao: "2025-02-28",
        baseTributavel: 412.3,
        totalIva: 94.83,
        totalDocumento: 507.13,
        situacao: "Certificado",
        origemFicheiro: "demo_compras_fevereiro.xlsx",
      },
    ];

    setInvoices(demoData);
    setProcessedFiles(["demo_compras_janeiro.xlsx", "demo_compras_fevereiro.xlsx"]);
    toast.success("Faturas de exemplo carregadas! Pode agora testar o botão 'Descarregar Excel Consolidado'.");
  };

  const getPythonScriptCode = () => {
    return `import os
import sys
import time
from datetime import datetime, timedelta

# Extrator em Lote do e-Fatura AT (Gerado por Interconta)
# Configuracao: ${tipoMovimento.toUpperCase()} | ${dataInicio} a ${dataFim} | Lotes de ${intervaloDias} dias
def run():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        import subprocess
        print("A instalar playwright e dependencias necessarias...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "pandas", "openpyxl"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    tipo = "${tipoMovimento}"
    start_date = datetime.strptime("${dataInicio}", "%Y-%m-%d")
    end_date = datetime.strptime("${dataFim}", "%Y-%m-%d")
    delta = timedelta(days=${intervaloDias})
    nif = "${nifEmpresa}"
    senha = "${senhaAt}"
    
    out_dir = os.path.abspath("./downloads_efatura")
    os.makedirs(out_dir, exist_ok=True)
    
    print("=" * 65)
    print("  INTERCONTA - EXTRATOR EM LOTE DO E-FATURA (PORTAL DAS FINANCAS)")
    print(f"  Tipo: {tipo.upper()} | NIF: {nif or 'Manual'}")
    print(f"  Periodo: {start_date.strftime('%d/%m/%Y')} a {end_date.strftime('%d/%m/%Y')}")
    print(f"  Pasta de Destino: {out_dir}")
    print("=" * 65)

    downloaded = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # Login no Portal das Financas / Acesso Gov
        print("\\nA abrir o portal de login do e-Fatura...")
        page.goto("https://www.acesso.gov.pt/v2/login?skin=efatura")
        
        # Preenchimento automatico se NIF e Senha foram configurados
        if nif and senha:
            print("A preencher credenciais AT automaticamente...")
            try:
                time.sleep(1)
                for un_sel in ["#username", "input[name='username']", "#nif"]:
                    if page.locator(un_sel).count() > 0:
                        page.fill(un_sel, nif)
                        break
                for pw_sel in ["#password", "input[name='password']", "#passwordInput"]:
                    if page.locator(pw_sel).count() > 0:
                        page.fill(pw_sel, senha)
                        break
                for btn_sel in ["button[type='submit']", "#sbmt-login", "input[type='submit']"]:
                    if page.locator(btn_sel).count() > 0:
                        page.click(btn_sel)
                        break
            except Exception as e:
                print(f"Aviso no preenchimento automatico: {e}")

        print("A aguardar que a autenticacao seja concluida...")
        # Aguardar que o utilizador faca login (timeout 120s)
        for _ in range(120):
            if "portaldasfinancas.gov.pt" in page.url.lower() and "login" not in page.url.lower():
                break
            time.sleep(1)
            
        target_url = "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action" if tipo == "compras" \\
            else "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosEmitente.action"
            
        print(f"A aceder a seccao de {tipo.upper()}...")
        page.goto(target_url)
        time.sleep(2)

        cur_start = start_date
        while cur_start <= end_date:
            cur_end = min(cur_start + delta - timedelta(days=1), end_date)
            s_str = cur_start.strftime("%Y-%m-%d")
            e_str = cur_end.strftime("%Y-%m-%d")
            
            print(f"[Lote] A extrair de {cur_start.strftime('%d-%m-%Y')} a {cur_end.strftime('%d-%m-%Y')}...")
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
                
                # Exportar para Excel / CSV
                for exp in ["a:has-text('Exportar para Excel')", "a:has-text('Exportar')", "button:has-text('Exportar')", ".btn-export"]:
                    if page.locator(exp).count() > 0 and page.locator(exp).is_visible():
                        with page.expect_download(timeout=10000) as dl:
                            page.click(exp)
                        d = dl.value
                        fname = f"faturas_{tipo}_{s_str}_{e_str}" + os.path.splitext(d.suggested_filename)[1]
                        dest = os.path.join(out_dir, fname)
                        d.save_as(dest)
                        downloaded.append(dest)
                        print(f"  -> Sucesso! Ficheiro guardado: {fname}")
                        break
            except Exception as ex:
                print(f"  -> Aviso no lote: {ex}")
                
            cur_start = cur_end + timedelta(days=1)
            time.sleep(1.5)

        browser.close()
        
    print(f"\\nExtracao finalizada! Total de ficheiros descarregados: {len(downloaded)}")
    
    # Consolidar em ficheiro unico
    if downloaded:
        try:
            import pandas as pd
            dfs = [pd.read_excel(f) if f.endswith('.xlsx') else pd.read_csv(f, sep=';', encoding='latin1') for f in downloaded]
            combined = pd.concat(dfs, ignore_index=True).drop_duplicates()
            final_name = os.path.join(out_dir, f"CONSOLIDADO_{tipo.upper()}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx")
            combined.to_excel(final_name, index=False)
            print(f"\\n[FICHEIRO UNICO GERADO]: {final_name}")
        except Exception as e:
            print(f"Aviso na consolidacao automatica: {e}")

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
    const scriptName = `extrator_efatura_${tipoMovimento}_${nifEmpresa || "empresa"}_${ano}.py`;
    // Fazer download do .py e do .bat juntos
    handleDownloadPythonScript();

    const batContent = `@echo off
chcp 65001 >nul
title Interconta - Extrator e-Fatura AT
echo ====================================================================
echo                 INTERCONTA - EXTRATOR E-FATURA AT
echo ====================================================================
echo.
echo A verificar o Python no sistema...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O Python nao foi encontrado no PATH.
    echo Por favor instale o Python atraves de https://www.python.org marcando "Add to PATH".
    pause
    exit /b 1
)

echo [OK] Python detetado. A verificar bibliotecas necessarias...
pip install playwright pandas openpyxl requests >nul 2>&1
python -m playwright install chromium >nul 2>&1

echo.
echo A iniciar a extracao automatica para ${tipoMovimento.toUpperCase()} (${dataInicio} ate ${dataFim})...
echo O navegador abrira no Portal das Financas para efetuar/confirmar o login.
echo.
python "${scriptName}"

echo.
echo ====================================================================
echo  Extracao terminada! Ficheiros guardados na pasta 'downloads_efatura'
echo ====================================================================
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
    toast.success("Ficheiro de execução (.bat) e Script (.py) descarregados com sucesso!");
  };

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

      const deduplicatedMap = new Map<string, ExtractedInvoice>();
      invoices.forEach((inv) => deduplicatedMap.set(inv.uid, inv));
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
      toast.error("Não existem faturas para descarregar. Carregue ficheiros ou use o exemplo.");
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

    const exportFileName = `FATURAS_${tipoMovimento.toUpperCase()}_${nifEmpresa || "CONSOLIDADO"}_${ano}.xlsx`;
    XLSX.writeFile(workbook, exportFileName);
    toast.success(`Ficheiro descarregado com sucesso: ${exportFileName}`);
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
      {/* Page Header com Ações Rápidas em Destaque */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5 bg-card/70 p-6 rounded-2xl border shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary shrink-0 shadow-sm">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Extrator e-Fatura (AT)</h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-medium">
                Portal Autoridade Tributária
              </Badge>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                Sem Limite de 300 Documentos
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Extração automatizada em lote de faturas de compras e vendas e consolidação num único ficheiro Excel.
            </p>
          </div>
        </div>

        {/* Botões Principais no Topo */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleOpenEfaturaPortal}
            className="gap-2 border-primary/30 hover:bg-primary/5 text-xs font-semibold h-10 shadow-sm"
          >
            <ExternalLink className="w-4 h-4 text-primary" />
            Fazer Login no Portal e-Fatura
          </Button>

          <Button
            onClick={handleDownloadBat}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-10 shadow-sm"
          >
            <DownloadCloud className="w-4 h-4" />
            Descarregar Extrator Automático (.bat)
          </Button>

          {invoices.length > 0 && (
            <Button
              onClick={handleExportConsolidatedExcel}
              variant="default"
              className="gap-2 font-semibold h-10 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Descarregar Faturas ({invoices.length})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="extrator" className="w-full space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-xl h-11 bg-muted/60 p-1 border rounded-xl">
          <TabsTrigger value="extrator" className="flex items-center gap-2 rounded-lg font-medium">
            <Sliders className="w-4 h-4" />
            1. Login & Extração em Lote
          </TabsTrigger>
          <TabsTrigger value="consolidador" className="flex items-center gap-2 rounded-lg font-medium">
            <Layers className="w-4 h-4" />
            2. Faturas & Download ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="script" className="flex items-center gap-2 rounded-lg font-medium">
            <FileCode className="w-4 h-4" />
            3. Código Playwright
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Login & Configuração da Extração */}
        <TabsContent value="extrator" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda: Autenticação + Parâmetros */}
            <div className="lg:col-span-2 space-y-6">
              {/* CARD 1: Autenticação / Login no e-Fatura */}
              <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-primary" />
                      Autenticação no Portal das Finanças / e-Fatura
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Insira o NIF e a Senha de Acesso da AT para o extrator iniciar sessão automaticamente
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenEfaturaPortal}
                    className="text-primary hover:text-primary gap-1.5 text-xs h-8 px-2.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Página de Login Oficial
                  </Button>
                </div>

                {/* Selecionar Cliente do Interconta */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Empresa / Cliente do Gabinete
                  </Label>
                  <Select value={selectedClientId} onValueChange={handleClientChange}>
                    <SelectTrigger className="w-full h-10">
                      <SelectValue placeholder="Selecione um cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">-- Inserir NIF / Credenciais Manualmente --</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {c.nif ? `(${c.nif})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground">NIF do Contribuinte / Empresa</Label>
                    <Input
                      placeholder="Ex: 508433797"
                      value={nifEmpresa}
                      onChange={(e) => setNifEmpresa(e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Senha de Acesso AT (Finanças)</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Opcional se autenticar no browser</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Insira a senha do Portal das Finanças"
                        value={senhaAt}
                        onChange={(e) => setSenhaAt(e.target.value)}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-muted/40 rounded-xl text-xs text-muted-foreground flex items-start gap-2.5 border">
                  <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">Privacidade e Segurança: </span>
                    As credenciais nunca são guardadas na nuvem nem saem do seu computador. O script Playwright é executado localmente na sua máquina e abre diretamente a página oficial da Autoridade Tributária.
                  </div>
                </div>
              </div>

              {/* CARD 2: Parâmetros de Extração */}
              <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
                <div className="border-b border-border pb-4">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    Parâmetros dos Documentos a Extrair
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Escolha entre Compras ou Vendas e defina o período temporal pretendido
                  </p>
                </div>

                {/* Tipo de Documento */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo de Faturas
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div
                      onClick={() => setTipoMovimento("compras")}
                      className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col gap-1.5 transition-all ${
                        tipoMovimento === "compras"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">
                          Compras (Adquirente)
                        </span>
                        {tipoMovimento === "compras" && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground leading-relaxed">
                        Faturas recebidas de fornecedores emitidas com o NIF da sua empresa
                      </span>
                    </div>

                    <div
                      onClick={() => setTipoMovimento("vendas")}
                      className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col gap-1.5 transition-all ${
                        tipoMovimento === "vendas"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">
                          Vendas (Emitente)
                        </span>
                        {tipoMovimento === "vendas" && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground leading-relaxed">
                        Faturas, faturas-recibo e notas de crédito emitidas aos seus clientes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Período */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ano Fiscal / Intervalo
                    </Label>
                    <div className="flex items-center gap-1.5">
                      {["2026", "2025", "2024"].map((y) => (
                        <Button
                          key={y}
                          type="button"
                          variant={ano === y ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => handleAnoChange(y)}
                        >
                          Ano {y}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Data Início</Label>
                      <Input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Data Fim</Label>
                      <Input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Fragmentação de Lote */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Intervalo por Lote (Anti-Bloqueio AT)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        A AT trunca exportações superiores a 300 documentos por pedido
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs border-success/40 text-success bg-success/5 font-semibold">
                      Semanal (Recomendado)
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

            {/* Coluna Direita: Caixa de Download & Ações Imediatas */}
            <div className="space-y-6">
              <div className="bg-card border-2 border-primary/20 rounded-2xl p-6 space-y-6 shadow-sm">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <DownloadCloud className="w-5 h-5 text-primary" />
                    Descarregar Extrator
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gera o extrator configurado pronto a correr com duplo clique no seu computador
                  </p>
                </div>

                {/* Resumo do Lote */}
                <div className="bg-muted/40 p-4 rounded-xl text-xs space-y-2.5 border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo de Movimento:</span>
                    <span className="font-bold uppercase text-foreground">{tipoMovimento}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NIF da Empresa:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {nifEmpresa || "Manual no Browser"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Período Selecionado:</span>
                    <span className="font-semibold text-foreground">
                      {dataInicio} a {dataFim}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Lotes Calculados:</span>
                    <Badge variant="secondary" className="font-bold">
                      {calcularNumeroLotes()} pedidos semanais
                    </Badge>
                  </div>
                </div>

                {/* Botões de Ação Destacados */}
                <div className="space-y-3 pt-1">
                  <Button
                    onClick={handleDownloadBat}
                    className="w-full gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 shadow-sm text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Descarregar Executável (.bat)
                  </Button>

                  <Button
                    onClick={handleDownloadPythonScript}
                    variant="outline"
                    className="w-full gap-2 h-10 text-xs font-semibold"
                  >
                    <FileCode className="w-4 h-4 text-primary" />
                    Descarregar Script Python (.py)
                  </Button>

                  <Button
                    onClick={handleOpenEfaturaPortal}
                    variant="ghost"
                    className="w-full gap-2 text-xs h-9 border border-border/80"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Fazer Login no e-Fatura Manualmente
                  </Button>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl text-[11px] text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Como funciona:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                    <li>Descarregue o <code>.bat</code> com o botão verde acima.</li>
                    <li>Dê duplo clique no ficheiro descarregado.</li>
                    <li>O Chromium abre a página da AT para autenticação e descarrega todos os lotes para Excel!</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: Faturas Consolidadas & Download */}
        <TabsContent value="consolidador" className="space-y-6">
          {/* Métricas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Faturas</p>
                <h3 className="text-2xl font-bold text-foreground">{totalFaturas}</h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Base Tributável</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalBase.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total IVA</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalIva.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total com IVA</p>
                <h3 className="text-xl font-bold text-foreground">
                  {totalGeral.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
                </h3>
              </div>
            </div>
          </div>

          {/* Zona de Drop / Upload e Ações */}
          <div className="bg-card border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-2xl p-8 text-center space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Carregar Ficheiros do e-Fatura (.xlsx, .xls, .csv)
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-lg mx-auto">
                Arraste os ficheiros descarregados pelo extrator ou carregue um lote de faturas. A aplicação junta tudo, elimina duplicados e calcula os totais de impostos.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="gap-2 font-semibold h-10"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isProcessing ? "A processar..." : "Carregar Ficheiros em Lote"}
              </Button>

              {invoices.length === 0 ? (
                <Button
                  variant="outline"
                  onClick={loadDemoInvoices}
                  className="gap-2 border-primary/20 hover:bg-primary/5 text-xs h-10"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  Carregar Faturas de Demonstração
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={handleExportConsolidatedExcel}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-10"
                >
                  <Download className="w-4 h-4" />
                  Descarregar Excel Consolidado ({invoices.length})
                </Button>
              )}

              {invoices.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setInvoices([]);
                    setProcessedFiles([]);
                    toast.info("Lista de faturas limpa.");
                  }}
                  className="text-xs h-10 text-muted-foreground"
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
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative w-full max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por NIF, Fornecedor, Documento..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-10 text-xs"
                />
              </div>

              {invoices.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleExportConsolidatedExcel}
                    className="gap-2 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descarregar Faturas em Excel (.xlsx)
                  </Button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] tracking-wider border-b">
                  <tr>
                    <th className="py-3 px-3.5">Data</th>
                    <th className="py-3 px-3.5">Tipo</th>
                    <th className="py-3 px-3.5">Nº Documento</th>
                    <th className="py-3 px-3.5">Emitente (Fornecedor)</th>
                    <th className="py-3 px-3.5">Adquirente (Cliente)</th>
                    <th className="py-3 px-3.5 text-right">Base (€)</th>
                    <th className="py-3 px-3.5 text-right">IVA (€)</th>
                    <th className="py-3 px-3.5 text-right">Total (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-muted-foreground">
                        {invoices.length === 0 ? (
                          <div className="space-y-2">
                            <p>Nenhuma fatura carregada ainda.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={loadDemoInvoices}
                              className="text-xs gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-primary" />
                              Carregar Faturas de Demonstração
                            </Button>
                          </div>
                        ) : (
                          "Nenhuma fatura encontrada com os filtros atuais."
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((inv) => (
                      <tr key={inv.uid} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3.5 font-medium text-foreground whitespace-nowrap">
                          {inv.dataEmissao}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                            {inv.tipoDocumento}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3.5 font-mono font-medium text-foreground whitespace-nowrap">
                          {inv.numeroDocumento}
                        </td>
                        <td className="py-2.5 px-3.5 max-w-[200px] truncate" title={`${inv.nomeEmitente} (${inv.nifEmitente})`}>
                          <div className="font-medium text-foreground truncate">{inv.nomeEmitente || inv.nifEmitente}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{inv.nifEmitente}</div>
                        </td>
                        <td className="py-2.5 px-3.5 max-w-[200px] truncate" title={`${inv.nomeAdquirente} (${inv.nifAdquirente})`}>
                          <div className="font-medium text-foreground truncate">{inv.nomeAdquirente || inv.nifAdquirente}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{inv.nifAdquirente}</div>
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono">
                          {inv.baseTributavel.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {inv.totalIva.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-foreground">
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
                    className="h-8 text-xs"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="px-2.5 font-medium text-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
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
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-primary" />
                  Script de Automação Playwright (Python)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Script pronto com as datas selecionadas ({tipoMovimento.toUpperCase()} de {ano})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyCode} className="gap-1.5 text-xs h-9">
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Código
                </Button>
                <Button size="sm" onClick={handleDownloadPythonScript} className="gap-1.5 text-xs h-9">
                  <Download className="w-3.5 h-3.5" />
                  Descarregar .py
                </Button>
              </div>
            </div>

            {/* Code Block */}
            <div className="relative rounded-xl overflow-hidden border border-border bg-muted/40">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/80 border-b border-border text-[11px] text-muted-foreground font-mono">
                <span>extrator_efatura_{tipoMovimento}.py</span>
                <span className="text-primary font-semibold">Playwright + Sync API</span>
              </div>
              <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[420px]">
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
