import { useState, useEffect } from "react";
import { fetchFiscalConfig, saveFiscalConfig, FiscalConfig } from "@/lib/fiscal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const OBRIGACOES = [
  { key: "dmr", label: "DMR" },
  { key: "saft", label: "SAF-T" },
  { key: "irc", label: "IRC" },
  { key: "ies", label: "IES" },
  { key: "salarios", label: "Salários" },
  { key: "inventario", label: "Inventário" },
  { key: "modelo_10", label: "Modelo 10" },
];

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

const ANOS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

// Predefinições standard portuguesas se não houver config na cloud
const DEFAULT_CONFIGS: Record<string, Omit<FiscalConfig, "id"|"ano">> = {
  dmr: { obrigacao: "dmr", tipo: "mensal", mes_entrega: null, dia_limite: 10 },
  saft: { obrigacao: "saft", tipo: "mensal", mes_entrega: null, dia_limite: 5 },
  salarios: { obrigacao: "salarios", tipo: "mensal", mes_entrega: null, dia_limite: 31 },
  irc: { obrigacao: "irc", tipo: "anual", mes_entrega: 5, dia_limite: 31 },
  ies: { obrigacao: "ies", tipo: "anual", mes_entrega: 7, dia_limite: 15 },
  inventario: { obrigacao: "inventario", tipo: "anual", mes_entrega: 1, dia_limite: 31 },
  modelo_10: { obrigacao: "modelo_10", tipo: "anual", mes_entrega: 2, dia_limite: 10 },
};

const FiscalConfigPanel = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [configs, setConfigs] = useState<Record<string, FiscalConfig>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadInfo();
  }, [ano]);

  const loadInfo = async () => {
    setLoading(true);
    const data = await fetchFiscalConfig(ano);
    
    const mapa: Record<string, FiscalConfig> = {};
    
    // Injetar defaults caso não exista registo
    OBRIGACOES.forEach(o => {
      const row = data.find(d => d.obrigacao === o.key);
      if (row) {
        mapa[o.key] = row;
      } else {
        const def = DEFAULT_CONFIGS[o.key];
        mapa[o.key] = {
          id: "",
          ano: ano,
          ...def
        };
      }
    });
    
    setConfigs(mapa);
    setLoading(false);
  };

  const handleUpdate = async (obKey: string, partial: Partial<FiscalConfig>) => {
    const updated = { ...configs[obKey], ...partial };
    
    // Se muda para mensal, força mes_entrega a null
    if (updated.tipo === "mensal") {
      updated.mes_entrega = null;
    }
    // Se muda para anual e não tem mês, assume default ou 1
    if (updated.tipo === "anual" && !updated.mes_entrega) {
      updated.mes_entrega = DEFAULT_CONFIGS[obKey].mes_entrega || 1;
    }

    setConfigs(prev => ({ ...prev, [obKey]: updated }));
  };

  const saveLine = async (obKey: string) => {
    setSaving(s => ({ ...s, [obKey]: true }));
    const row = configs[obKey];
    
    const { success, error } = await saveFiscalConfig(row);
    if (!success) {
      if (error?.code === "42P01") {
        toast({ title: "Tabela Inexistente", description: "O gestor de base de dados ainda não criou a tabela fiscal_config no Supabase.", variant: "destructive" });
      } else {
        toast({ title: "Erro a gravar", description: (error as any)?.message, variant: "destructive" });
      }
      setSaving(s => ({ ...s, [obKey]: false }));
      return;
    }

    // Recarregar os ids reais após um possível insert invisível
    const freshData = await fetchFiscalConfig(ano);
    const serverRow = freshData.find(d => d.obrigacao === obKey);
    if (serverRow) {
      setConfigs(prev => ({ ...prev, [obKey]: serverRow }));
    }

    toast({ title: "Gravado", description: "Parametrização atualizada com sucesso!" });
    setSaving(s => ({ ...s, [obKey]: false }));
  };

  return (
    <div className="elevated-card rounded-xl p-6 mt-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Parametrização de Prazos Legais</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Configuração cronológica dos relatórios e sincronização de ghost tasks</p>
          </div>
        </div>

        <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
          <SelectTrigger className="w-[120px] bg-background">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map((a) => (
              <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-semibold">Obrigação</th>
                <th className="px-4 py-3 font-semibold">Temporalidade</th>
                <th className="px-4 py-3 font-semibold">Mês Formativo (Anuais)</th>
                <th className="px-4 py-3 font-semibold">Dia Limite</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {OBRIGACOES.map((ob) => {
                const conf = configs[ob.key];
                if(!conf) return null;
                const isSaving = saving[ob.key];

                return (
                  <tr key={ob.key} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{ob.label}</td>
                    
                    <td className="px-4 py-3">
                      <Select value={conf.tipo} onValueChange={(v: "mensal"|"anual") => handleUpdate(ob.key, { tipo: v })}>
                        <SelectTrigger className="w-[120px] bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="px-4 py-3">
                      <Select 
                        value={conf.mes_entrega ? conf.mes_entrega.toString() : ""} 
                        onValueChange={(v) => handleUpdate(ob.key, { mes_entrega: parseInt(v) })}
                        disabled={conf.tipo === "mensal"}
                      >
                        <SelectTrigger className="w-[140px] bg-transparent">
                          <SelectValue placeholder="N/A (Mensal)" />
                        </SelectTrigger>
                        <SelectContent>
                          {MESES.map(m => (
                            <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Dia</span>
                        <Input 
                          type="number" 
                          min={1} max={31} 
                          className="w-20 bg-transparent"
                          value={conf.dia_limite}
                          onChange={(e) => handleUpdate(ob.key, { dia_limite: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => saveLine(ob.key)} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {isSaving ? "" : "Gravar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FiscalConfigPanel;
