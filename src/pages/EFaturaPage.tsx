import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Building2,
  AlertCircle,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchClients, type Client } from "@/lib/clientes";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const EFaturaPage = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("manual");
  const [nif, setNif] = useState<string>("");
  const [senhaAt, setSenhaAt] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Passo 2: Seleção de Documentos & Datas
  const [tipo, setTipo] = useState<"compras" | "vendas">("compras");
  const [ano, setAno] = useState<string>("2025");
  const [dataInicio, setDataInicio] = useState<string>("2025-01-01");
  const [dataFim, setDataFim] = useState<string>("2025-12-31");

  // Estado de Extração e Download
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");

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
      setNif("");
    } else {
      const client = clients.find((c) => c.id === clientId);
      if (client && client.nif) {
        setNif(client.nif);
      }
    }
  };

  const handleAnoChange = (selectedAno: string) => {
    setAno(selectedAno);
    setDataInicio(`${selectedAno}-01-01`);
    setDataFim(`${selectedAno}-12-31`);
  };

  const handleQuarterChange = (q: number) => {
    const qMap: Record<number, { start: string; end: string }> = {
      1: { start: `${ano}-01-01`, end: `${ano}-03-31` },
      2: { start: `${ano}-04-01`, end: `${ano}-06-30` },
      3: { start: `${ano}-07-01`, end: `${ano}-09-30` },
      4: { start: `${ano}-10-01`, end: `${ano}-12-31` },
    };
    setDataInicio(qMap[q].start);
    setDataFim(qMap[q].end);
  };

  const handleAbrirLoginPortal = () => {
    window.open("https://www.acesso.gov.pt/v2/login?skin=efatura", "_blank");
    toast.info("A abrir a página oficial de login do e-Fatura no seu navegador...");
  };

  // Extração e download direto para Excel
  const handleDownloadExcel = async () => {
    if (!nif && selectedClientId === "manual") {
      toast.error("Por favor insira o NIF da empresa ou selecione um cliente.");
      return;
    }

    setIsExtracting(true);
    setProgressMsg("A conectar ao e-Fatura e a preparar os lotes de extração...");

    try {
      // 1. Tentar acionar o serviço local se disponível
      let localSuccess = false;
      try {
        const checkRes = await fetch("http://localhost:3001/api/sync", { method: "OPTIONS" }).catch(() => null);
        if (checkRes) {
          setProgressMsg("Servidor local detetado. A iniciar extração no e-Fatura...");
          const extractRes = await fetch("http://localhost:3001/api/efatura/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo,
              inicio: dataInicio,
              fim: dataFim,
              nif,
              senha: senhaAt,
              dias: 7,
            }),
          });
          if (extractRes.ok) {
            const blob = await extractRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `FATURAS_${tipo.toUpperCase()}_${nif}_${ano}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            localSuccess = true;
            toast.success("Faturas extraídas e descarregadas para Excel com sucesso!");
          }
        }
      } catch {
        localSuccess = false;
      }

      // 2. Se correr diretamente no browser (sem servidor local em segundo plano),
      // gera o pacote executável configurado pronto a correr com duplo clique
      if (!localSuccess) {
        setProgressMsg("A gerar ficheiro Excel e assistente de extração em lote...");
        
        // Gerar script Python otimizado
        const pyCode = `import os, sys, time
from datetime import datetime, timedelta

def run():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "pandas", "openpyxl"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    tipo = "${tipo}"
    start_date = datetime.strptime("${dataInicio}", "%Y-%m-%d")
    end_date = datetime.strptime("${dataFim}", "%Y-%m-%d")
    delta = timedelta(days=7)
    nif = "${nif}"
    senha = "${senhaAt}"

    out_dir = os.path.abspath("./downloads_efatura")
    os.makedirs(out_dir, exist_ok=True)

    downloaded = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        page.goto("https://www.acesso.gov.pt/v2/login?skin=efatura")
        if nif and senha:
            try:
                time.sleep(1)
                page.fill("#username", nif)
                page.fill("#password", senha)
                page.click("button[type='submit']")
            except Exception:
                pass

        print("A aguardar login no e-Fatura...")
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
            print(f"A extrair lote de {cur_start.strftime('%d-%m-%Y')} a {cur_end.strftime('%d-%m-%Y')}...")
            try:
                for sel in ["#dataInicio", "input[name='dataInicio']"]:
                    if page.locator(sel).count() > 0:
                        page.fill(sel, s_str)
                        break
                for sel in ["#dataFim", "input[name='dataFim']"]:
                    if page.locator(sel).count() > 0:
                        page.fill(sel, e_str)
                        break
                for btn in ["button:has-text('Pesquisar')", "#pesquisarBtn"]:
                    if page.locator(btn).count() > 0:
                        page.click(btn)
                        break
                time.sleep(2)
                for exp in ["a:has-text('Exportar para Excel')", "button:has-text('Exportar')", ".btn-export"]:
                    if page.locator(exp).count() > 0:
                        with page.expect_download(timeout=10000) as dl:
                            page.click(exp)
                        d = dl.value
                        fname = f"faturas_{tipo}_{s_str}_{e_str}.xlsx"
                        dest = os.path.join(out_dir, fname)
                        d.save_as(dest)
                        downloaded.append(dest)
                        break
            except Exception as e:
                print(f"Aviso no lote: {e}")
            cur_start = cur_end + timedelta(days=1)
            time.sleep(1)

        browser.close()

    if downloaded:
        import pandas as pd
        dfs = [pd.read_excel(f) if f.endswith('.xlsx') else pd.read_csv(f, sep=';', encoding='latin1') for f in downloaded]
        combined = pd.concat(dfs, ignore_index=True).drop_duplicates()
        excel_final = os.path.join(out_dir, f"FATURAS_CONSOLIDADAS_${tipo.toUpperCase()}_${nif}_${ano}.xlsx")
        combined.to_excel(excel_final, index=False)
        print(f"SUCESSO! Ficheiro Excel gerado com {len(combined)} faturas: {excel_final}")
        os.startfile(excel_final)

if __name__ == "__main__":
    run()
`;

        const batContent = `@echo off
chcp 65001 >nul
title Interconta - Extrator e-Fatura
echo ====================================================================
echo  INTERCONTA - EXTRAIR FATURAS DE ${tipo.toUpperCase()} (${dataInicio} A ${dataFim})
echo ====================================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Instale o Python em https://www.python.org marcando "Add to PATH".
    pause
    exit /b 1
)
pip install playwright pandas openpyxl >nul 2>&1
python -m playwright install chromium >nul 2>&1
python "extrator_${tipo}_${nif}_${ano}.py"
pause
`;

        // Descarregar o ficheiro .bat
        const blobBat = new Blob([batContent], { type: "text/plain;charset=utf-8;" });
        const urlBat = URL.createObjectURL(blobBat);
        const aBat = document.createElement("a");
        aBat.href = urlBat;
        aBat.download = `extrair_faturas_${tipo}_${nif}_${ano}.bat`;
        document.body.appendChild(aBat);
        aBat.click();
        document.body.removeChild(aBat);

        // Descarregar o ficheiro .py associado
        const blobPy = new Blob([pyCode], { type: "text/x-python;charset=utf-8;" });
        const urlPy = URL.createObjectURL(blobPy);
        const aPy = document.createElement("a");
        aPy.href = urlPy;
        aPy.download = `extrator_${tipo}_${nif}_${ano}.py`;
        document.body.appendChild(aPy);
        aPy.click();
        document.body.removeChild(aPy);

        toast.success(
          "Extrator gerado e descarregado com sucesso! Dê duplo clique no ficheiro .bat descarregado para abrir o navegador e exportar todas as faturas para Excel."
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao processar: ${errMsg}`);
    } finally {
      setIsExtracting(false);
      setProgressMsg("");
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5 bg-card p-6 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/20 shrink-0">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground">Extrator e-Fatura para Excel</h1>
              <Badge className="bg-emerald-600 text-white font-medium hover:bg-emerald-600">
                +300 Faturas Suportadas
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Faça login no portal, selecione o período e descarregue todas as faturas diretamente para Excel.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleAbrirLoginPortal}
          className="gap-2 text-xs font-semibold h-10 border-primary/30 text-primary hover:bg-primary/5"
        >
          <ExternalLink className="w-4 h-4" />
          Abrir Portal e-Fatura Oficial
        </Button>
      </div>

      {/* FLUXO EM 3 PASSOS SIMPLES */}
      <div className="space-y-6">
        {/* PASSO 1: LOGIN NO E-FATURA */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
              1
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Login no e-Fatura (Portal das Finanças)</h2>
              <p className="text-xs text-muted-foreground">
                Selecione o cliente do gabinete ou introduza o NIF e a Senha da AT
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente / Empresa do Interconta
              </Label>
              <Select value={selectedClientId} onValueChange={handleClientChange}>
                <SelectTrigger className="h-10">
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
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">NIF da Empresa</Label>
                <Input
                  placeholder="Ex: 508433797"
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  className="h-10 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Senha de Acesso AT (Finanças)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Opcional se fizer login manual no browser</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Palavra-passe das Finanças"
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
          </div>
        </div>

        {/* PASSO 2: SELEÇÃO DE DATAS E TIPO */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
              2
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Selecionar Tipo e Datas</h2>
              <p className="text-xs text-muted-foreground">
                Escolha entre faturas de Compras ou Vendas e o intervalo de datas a extrair
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Escolha Compras ou Vendas */}
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => setTipo("compras")}
                className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col gap-1 transition-all ${
                  tipo === "compras"
                    ? "border-emerald-600 bg-emerald-500/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 bg-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">Compras (Adquirente)</span>
                  {tipo === "compras" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <span className="text-xs text-muted-foreground">
                  Faturas recebidas de fornecedores emitidas para o NIF
                </span>
              </div>

              <div
                onClick={() => setTipo("vendas")}
                className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col gap-1 transition-all ${
                  tipo === "vendas"
                    ? "border-emerald-600 bg-emerald-500/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 bg-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">Vendas (Emitente)</span>
                  {tipo === "vendas" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <span className="text-xs text-muted-foreground">
                  Faturas e documentos emitidos aos seus clientes
                </span>
              </div>
            </div>

            {/* Período */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Atalhos Rápidos de Datas
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleQuarterChange(1)}
                  >
                    1º Trim
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleQuarterChange(2)}
                  >
                    2º Trim
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleQuarterChange(3)}
                  >
                    3º Trim
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleQuarterChange(4)}
                  >
                    4º Trim
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data de Início</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data de Fim</Label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            {/* Garantia das 300 faturas */}
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                <strong>Garantia Sem Limite:</strong> O extrator fragmenta automaticamente o período em intervalos semanais (7 dias). Isso contorna a limitação da AT de 300 documentos, permitindo extrair centenas ou milhares de faturas num único ficheiro Excel consolidado.
              </span>
            </div>
          </div>
        </div>

        {/* PASSO 3: DESCARREGAR PARA EXCEL */}
        <div className="bg-card border-2 border-emerald-500/30 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
              3
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Descarregar para Excel</h2>
              <p className="text-xs text-muted-foreground">
                Inicie a extração em lote e obtenha o ficheiro Excel consolidado com todas as faturas
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong className="text-foreground">Configuração Pronta:</strong> Faturas de{" "}
                <span className="uppercase font-bold text-foreground">{tipo}</span> de{" "}
                <span className="font-semibold text-foreground">{dataInicio}</span> até{" "}
                <span className="font-semibold text-foreground">{dataFim}</span>.
              </p>
              <p>NIF: <span className="font-mono font-semibold text-foreground">{nif || "Definido no login"}</span></p>
            </div>

            <Button
              onClick={handleDownloadExcel}
              disabled={isExtracting}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 px-8 text-sm gap-2.5 shadow-md"
            >
              {isExtracting ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <FileDown className="w-5 h-5" />
              )}
              {isExtracting ? "A Extrair Faturas..." : "Descarregar para Excel (.xlsx)"}
            </Button>
          </div>

          {progressMsg && (
            <div className="p-3 bg-muted/60 rounded-xl text-xs font-medium text-foreground flex items-center gap-2 border">
              <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
              <span>{progressMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EFaturaPage;
