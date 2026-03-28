import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { fetchClients, type Client } from "@/lib/clientes";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const YEARS_KEY = "interconta_lancamentos_years";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface LancamentoEntry {
  clientId: string;
  year: number;
  month: number;
  bancos: boolean;
}

const loadYears = (): number[] => {
  try {
    const raw = localStorage.getItem(YEARS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.sort((a: number, b: number) => a - b);
    }
  } catch {}
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear];
};

const saveYears = (years: number[]) => {
  localStorage.setItem(YEARS_KEY, JSON.stringify(years));
};

const LancamentosPage = () => {
  const navigate = useNavigate();
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>(loadYears);
  const [year, setYear] = useState(String(currentYear));
  
  const [lancamentos, setLancamentos] = useState<LancamentoEntry[]>([]);

  useEffect(() => { 
    saveYears(years); 
  }, [years]);

  useEffect(() => {
    // Carregar clientes ativos
    fetchClients().then((data) => {
      setAllClients(data);
    });

    // Carregar lançamentos (Bancos)
    supabase.from('lancamentos').select('*').then(({ data, error }) => {
      if (error) {
         toast.error("Erro a carregar lançamentos bancários da Cloud");
      } else if (data) {
         setLancamentos(data.map(d => ({
           clientId: d.client_id,
           year: d.year,
           month: d.month,
           bancos: d.bancos
         })));
      }
      setLoading(false);
    });
  }, []);

  const clients = allClients.filter((c) => c.status === "ativo");

  const getEntry = (clientId: string, month: number): LancamentoEntry => {
    return (
      lancamentos.find(
        (e) => e.clientId === clientId && e.year === Number(year) && e.month === month
      ) ?? { clientId, year: Number(year), month, bancos: false }
    );
  };

  const toggleBancos = async (clientId: string, month: number) => {
    const numYear = Number(year);
    
    // Atualiza a vista instantaneamente (optimistic update)
    let newBancosValue = true;
    setLancamentos((prev) => {
      const idx = prev.findIndex(
        (e) => e.clientId === clientId && e.year === numYear && e.month === month
      );
      
      const updated = [...prev];
      if (idx >= 0) {
        newBancosValue = !updated[idx].bancos;
        updated[idx] = { ...updated[idx], bancos: newBancosValue };
      } else {
        updated.push({ clientId, year: numYear, month, bancos: true });
      }
      return updated;
    });

    // Enviar para a DB de forma invisível
    const { error } = await supabase.from('lancamentos').upsert({
      client_id: clientId,
      year: numYear,
      month: month,
      bancos: newBancosValue
    }, { onConflict: 'client_id, year, month' });

    if (error) {
       toast.error("Não foi possível gravar na cloud. A reverter...");
       // Revert UI on error
       setLancamentos((prev) => {
          const idx = prev.findIndex(e => e.clientId === clientId && e.year === numYear && e.month === month);
          if (idx >= 0) {
            const reverted = [...prev];
            reverted[idx] = { ...reverted[idx], bancos: !newBancosValue };
            return reverted;
          }
          return prev;
       });
    }
  };

  const addYear = () => {
    const maxYear = Math.max(...years);
    const newYear = maxYear + 1;
    setYears(prev => [...prev, newYear].sort((a, b) => a - b));
    setYear(String(newYear));
    toast.success(`Ano ${newYear} ativado no filtro`);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tarefas")} disabled={loading}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lançamentos Bancários</h1>
            <p className="text-muted-foreground mt-1">
              {loading ? "A sincronizar estados com a Cloud..." : "Controlo mensal (Bancos/IVA) permanentemente ligado em tempo real"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear} disabled={loading}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={addYear} title="Adicionar novo ano civil" disabled={loading}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full text-sm border-collapse bg-card">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left py-3 px-4 font-semibold text-foreground sticky left-0 bg-muted/95 backdrop-blur z-10 min-w-[180px]">
                  Empresa
                </th>
                {MONTHS.map((m, i) => (
                <th key={i} className="text-center py-3 px-1 font-medium text-foreground min-w-[60px]">
                    <div className="text-xs uppercase tracking-wider">{m.substring(0, 3)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-8 text-muted-foreground">
                    Sem clientes ativos no sistema.
                  </td>
                </tr>
              ) : clients.map((client, ci) => (
                <motion.tr
                  key={client.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.03 }}
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                    ci % 2 === 0 && "bg-muted/10"
                  )}
                >
                  <td className="py-2.5 px-4 font-medium text-foreground sticky left-0 bg-background/95 backdrop-blur z-10 transition-colors group-hover:bg-muted/50">
                    <div className="truncate max-w-[180px] text-sm">{client.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">NIF: {client.nif}</div>
                  </td>
                  {MONTHS.map((_, mi) => {
                    const entry = getEntry(client.id, mi);
                    return (
                      <td key={mi} className="text-center py-2.5 px-1 border-l border-border/30">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={entry.bancos}
                            onCheckedChange={() => toggleBancos(client.id, mi)}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </div>
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LancamentosPage;
