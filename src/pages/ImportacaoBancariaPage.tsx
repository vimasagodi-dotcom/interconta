import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Upload,
  FileCheck,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BankParseIssue,
  BankMovement,
  buildImportLines,
  downloadMicrodigitalFile,
  readBankExcel,
  parseBankRows,
  MICRODIGITAL_FILE_NAME,
} from "@/lib/bankImport";

const CONFIG_KEY = "interconta.bankImport.config";

const eur = (n: number) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pad2 = (n: number) => String(n).padStart(2, "0");

function loadConfig(): { diario: string; descritivo: string } {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignorar
  }
  return { diario: "", descritivo: "" };
}

export default function ImportacaoBancariaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [issues, setIssues] = useState<BankParseIssue[]>([]);
  const [diario, setDiario] = useState(() => loadConfig().diario);
  const [descritivo, setDescritivo] = useState(() => loadConfig().descritivo);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ diario, descritivo }));
  }, [diario, descritivo]);

  const diarioNum = /^\d+$/.test(diario.trim()) ? Number(diario.trim()) : null;
  const descritivoNum = /^\d+$/.test(descritivo.trim()) ? Number(descritivo.trim()) : null;
  const configOk = diarioNum !== null && diarioNum > 0 && descritivoNum !== null;

  const lines = useMemo(
    () => (configOk ? buildImportLines(movements, { diario: diarioNum!, descritivo: descritivoNum! }) : []),
    [movements, configOk, diarioNum, descritivoNum]
  );

  const totals = useMemo(() => {
    const debito = lines.reduce((s, l) => s + l.debito, 0);
    const credito = lines.reduce((s, l) => s + l.credito, 0);
    const meses = new Set(movements.map((m) => `${m.year}-${m.month}`)).size;
    return { debito, credito, meses, balanced: Math.abs(debito - credito) < 0.005 };
  }, [lines, movements]);

  const handleFile = async (f: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.error("Formato não suportado. Use um ficheiro .xlsx, .xls ou .csv.");
      return;
    }
    try {
      const rows = await readBankExcel(f);
      const res = parseBankRows(rows);
      if (res.movements.length === 0) {
        toast.error("Não foram encontrados movimentos válidos no ficheiro.");
        return;
      }
      setFile(f);
      setMovements(res.movements);
      setIssues(res.issues);
      toast.success(`${res.movements.length} movimentos lidos com sucesso.`);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao ler o Excel: " + (err?.message || err));
    }
  };

  const clearFile = () => {
    setFile(null);
    setMovements([]);
    setIssues([]);
  };

  const handleDownload = () => {
    if (!configOk) {
      toast.error("Indique o Diário e o Código do Descritivo.");
      return;
    }
    if (!totals.balanced) {
      toast.error("Os movimentos não estão balanceados.");
      return;
    }
    downloadMicrodigitalFile(lines, { diario: diarioNum!, descritivo: descritivoNum! });
    toast.success(`Ficheiro ${MICRODIGITAL_FILE_NAME} gerado com ${lines.length} linhas.`);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
          <Landmark className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Importação Bancária</h1>
          <p className="text-sm text-muted-foreground">
            Converte o Excel de movimentos bancários no ficheiro de importação da contabilidade Microdigital,
            com lançamentos balanceados e numeração automática.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* CARD: EXCEL DE MOVIMENTOS */}
        <div className="elevated-card rounded-2xl p-6 border border-border flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-base text-foreground">Movimentos bancários (Excel)</h2>
                <p className="text-xs text-muted-foreground">
                  Colunas: Data · Descritivo · Débito · Crédito · Conta Débito · Conta Crédito (suporta 6 colunas ou 7 com Saldo)
                </p>
              </div>
            </div>

            <input
              id="bank-excel-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />

            {!file ? (
              <div
                id="bank-excel-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById("bank-excel-input")?.click()}
                className={`border-2 border-dashed transition-all rounded-xl p-6 text-center flex flex-col items-center justify-center cursor-pointer h-[200px] ${
                  isDragging ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Arraste o Excel dos movimentos para aqui</p>
                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar (.xlsx, .xls, .csv)</p>
              </div>
            ) : (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck className="w-8 h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB • {movements.length} movimentos detetados
                    </p>
                  </div>
                </div>
                <Button
                  id="bank-excel-remove"
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remover ficheiro"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {file && (
            <div className="mt-4 pt-4 border-t border-border/60 text-[11px] text-muted-foreground grid grid-cols-2 gap-2">
              <div>
                Meses: <span className="font-medium text-foreground">{totals.meses}</span>
              </div>
              <div>
                Linhas a gerar: <span className="font-medium text-foreground">{movements.length * 2}</span>
              </div>
              <div>
                Total movimentos:{" "}
                <span className="font-medium text-foreground">{eur(movements.reduce((s, m) => s + m.amount, 0))}</span>
              </div>
              <div>
                Linhas ignoradas: <span className="font-medium text-foreground">{issues.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* CARD: CONFIGURAÇÃO */}
        <div className="elevated-card rounded-2xl p-6 border border-border flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-info/20 flex items-center justify-center text-info">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-base text-foreground">Dados da empresa</h2>
                <p className="text-xs text-muted-foreground">
                  Mudam de empresa para empresa (ficam guardados neste computador)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bank-diario" className="text-xs">
                  Diário
                </Label>
                <Input
                  id="bank-diario"
                  inputMode="numeric"
                  placeholder="ex: 9"
                  value={diario}
                  onChange={(e) => setDiario(e.target.value.replace(/\D/g, ""))}
                  className="h-11 text-base font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-descritivo" className="text-xs">
                  Código do Descritivo (CDESCR)
                </Label>
                <Input
                  id="bank-descritivo"
                  inputMode="numeric"
                  placeholder="ex: 18"
                  value={descritivo}
                  onChange={(e) => setDescritivo(e.target.value.replace(/\D/g, ""))}
                  className="h-11 text-base font-semibold"
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-muted/50 border border-border/60 p-4 text-xs text-muted-foreground space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <ListOrdered className="w-3.5 h-3.5" /> Numeração dos movimentos
              </p>
              <p>
                Diário + Mês + Nº sequencial, recomeçando em 001 em cada mês. Ex.:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {diarioNum ?? "9"}01001, {diarioNum ?? "9"}01002 … {diarioNum ?? "9"}02001
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/60">
            {configOk ? (
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Diário {diarioNum} · Descritivo {descritivoNum}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Preencha o Diário e o Código do Descritivo
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Avisos */}
      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs space-y-1">
          <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {issues.length} linha(s) do Excel não foram incluídas
          </p>
          {issues.slice(0, 10).map((i) => (
            <p key={i.sourceRow} className="text-muted-foreground">
              Linha {i.sourceRow}: {i.message}
            </p>
          ))}
        </div>
      )}

      {/* Barra de ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 elevated-card rounded-2xl p-4 border border-border">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {lines.length > 0 ? (
            <>
              <Badge variant="outline" className="font-semibold">
                {movements.length} movimentos · {lines.length} linhas
              </Badge>
              <Badge variant="outline">Débito {eur(totals.debito)}</Badge>
              <Badge variant="outline">Crédito {eur(totals.credito)}</Badge>
              <Badge
                className={
                  totals.balanced
                    ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30"
                    : "bg-destructive/15 text-destructive border-destructive/30"
                }
              >
                {totals.balanced ? "Balanceado" : "Não balanceado"}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">
              Carregue o Excel e indique o Diário e o Descritivo para gerar o ficheiro.
            </span>
          )}
        </div>
        <Button
          id="bank-download"
          onClick={handleDownload}
          disabled={lines.length === 0 || !totals.balanced}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 h-10 px-5 shadow-md"
        >
          <Download className="w-4 h-4" /> Descarregar ficheiro de importação (.xls)
        </Button>
      </div>

      {/* Pré-visualização */}
      {lines.length > 0 && (
        <div className="elevated-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
            Pré-visualização do ficheiro de importação
          </div>
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0">
                <tr>
                  {["Diário", "Data", "Nº Interno", "Conta", "Débito", "Crédito", "CDESCR", "Descritivo"].map((h) => (
                    <th key={h} className={`py-2.5 px-3 text-left ${h === "Débito" || h === "Crédito" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr
                    key={i}
                    className={`${l.movementIndex % 2 === 0 ? "bg-card" : "bg-muted/40"} ${
                      l.credito > 0 ? "border-b border-border/70" : ""
                    }`}
                  >
                    <td className="py-1.5 px-3">{diarioNum}</td>
                    <td className="py-1.5 px-3 font-mono">
                      {pad2(l.day)}/{pad2(l.month)}/{l.year}
                    </td>
                    <td className="py-1.5 px-3 font-mono font-semibold">{l.numero}</td>
                    <td className="py-1.5 px-3 font-mono">{l.conta}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{l.debito ? eur(l.debito) : "—"}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{l.credito ? eur(l.credito) : "—"}</td>
                    <td className="py-1.5 px-3">{descritivoNum}</td>
                    <td className="py-1.5 px-3 truncate max-w-[280px]">{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
