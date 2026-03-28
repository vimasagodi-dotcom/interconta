import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Client } from "@/lib/clientes";
import { fetchFiscalConfig, FiscalConfig } from "@/lib/fiscal";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Printer } from "lucide-react";

// Lista centralizada de obrigações geridas na grelha
const OBRIGACOES = [
  { key: "dmr", label: "DMR" },
  { key: "saft", label: "SAF-T" },
  { key: "irc", label: "IRC" },
  { key: "ies", label: "IES" },
  { key: "salarios", label: "Salários" },
  { key: "inventario", label: "Inventário" },
  { key: "modelo_10", label: "Modelo 10" },
] as const;

type ObrigacaoKey = typeof OBRIGACOES[number]["key"];

const RelatoriosPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clientes, setClientes] = useState<Client[]>([]);
  const [vistos, setVistos] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Estados dos Filtros
  const today = new Date();
  const [ano, setAno] = useState<number>(today.getFullYear());
  const [mes, setMes] = useState<number>(today.getMonth() + 1); // 1 a 12
  const [filterObrigacao, setFilterObrigacao] = useState<string>("todas");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterIva, setFilterIva] = useState<string>("todos");
  const [filterTsu, setFilterTsu] = useState<string>("todos");
  const [fiscalConfigs, setFiscalConfigs] = useState<FiscalConfig[]>([]);

  useEffect(() => {
    carregarDados();
  }, [ano, mes]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // 1. Carregar apenas Clientes Ativos
      const { data: dbClientes, error: errC } = await supabase
        .from("clientes")
        .select("*")
        .eq("status", "ativo")
        .order("name", { ascending: true });

      if (errC) throw errC;
      setClientes(dbClientes as Client[]);

      // 2. Carregar Relatórios/Vistos do Mês e Ano selecionados
      const { data: dbRelatorios, error: errR } = await supabase
        .from("relatorios_mensais")
        .select("cliente_id, obrigacao, concluido")
        .eq("ano", ano)
        .eq("mes", mes);

      if (errR) throw errR;

      // Converter array numa chave "idCliente_obrigacao" para leitura instantânea (O(1)) no JSX
      const mapaVistos: Record<string, boolean> = {};
      dbRelatorios?.forEach((registo) => {
        if (registo.concluido) {
          mapaVistos[`${registo.cliente_id}_${registo.obrigacao}`] = true;
        }
      });
      setVistos(mapaVistos);

      // 3. Carregar Configurações Fiscais do Ano
      const loadedConfigs = await fetchFiscalConfig(ano);
      setFiscalConfigs(loadedConfigs);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar a grelha de relatórios.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const alternarVisto = async (clienteId: string, obrigacao: ObrigacaoKey, estaConcluido: boolean) => {
    const chave = `${clienteId}_${obrigacao}`;
    const novoStatus = !estaConcluido;

    // Optimistic UI Update
    setVistos((prev) => ({ ...prev, [chave]: novoStatus }));

    try {
      if (novoStatus) {
        // Inserir / Marcar como concluído
        const { error } = await supabase.from("relatorios_mensais").upsert({
          cliente_id: clienteId,
          ano,
          mes,
          obrigacao,
          concluido: true,
          data_conclusao: new Date().toISOString(),
          tecnico: user?.name || user?.email || "Desconhecido"
        }, { onConflict: 'cliente_id,ano,mes,obrigacao' });
        if (error) throw error;
      } else {
        // Remover / Desmarcar
        const { error } = await supabase
          .from("relatorios_mensais")
          .delete()
          .eq("cliente_id", clienteId)
          .eq("ano", ano)
          .eq("mes", mes)
          .eq("obrigacao", obrigacao);
        if (error) throw error;
      }
    } catch (error) {
      console.error("Erro ao guardar visto:", error);
      // Reverter falha
      setVistos((prev) => ({ ...prev, [chave]: estaConcluido }));
      toast({
        title: "Erro de Gravação",
        description: "Erro ao guardar a alteração. Verifique a ligação: " + (error as any).message,
        variant: "destructive"
      });
    }
  };

  if (user?.role === "cliente") {
    return <Navigate to="/portal" replace />;
  }

  const mesesInfo = [
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

  const anosInfo = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  // Derive available options from the client base dynamically
  const iVASDisponiveis = Array.from(new Set(clientes.map(c => c.regimeIva).filter(Boolean)));
  const tsusDisponiveis = Array.from(new Set(clientes.map(c => c.tsu_tipo).filter(Boolean)));

  // Fallback map if config is missing in DB
  const defaultFiscalParams: Record<string, { tipo: string, mes_entrega: number | null }> = {
    dmr: { tipo: "mensal", mes_entrega: null },
    saft: { tipo: "mensal", mes_entrega: null },
    irc: { tipo: "anual", mes_entrega: 5 },
    ies: { tipo: "anual", mes_entrega: 7 },
    salarios: { tipo: "mensal", mes_entrega: null },
    inventario: { tipo: "anual", mes_entrega: 1 },
    modelo_10: { tipo: "anual", mes_entrega: 2 },
  };

  // Qual a lista de OBRIGACOES permitida para mostrar neste ANO e MÊS baseada na tabela the configs??
  const obrigacoesDoTempoVisivel = OBRIGACOES.filter((ob) => {
    const sysDbConfig = fiscalConfigs.find(c => c.obrigacao === ob.key);
    const tipo = sysDbConfig ? sysDbConfig.tipo : defaultFiscalParams[ob.key]?.tipo || "mensal";
    const mes_entrega = sysDbConfig ? sysDbConfig.mes_entrega : defaultFiscalParams[ob.key]?.mes_entrega || null;

    if (tipo === "mensal") return true; 
    if (tipo === "anual") return mes_entrega === mes;
    return true;
  });

  // Logic for advanced filtering
  const obrigacoesVisiveis = filterObrigacao === "todas" 
    ? obrigacoesDoTempoVisivel 
    : obrigacoesDoTempoVisivel.filter((o) => o.key === filterObrigacao);

  const clientesFiltrados = clientes.filter((cliente) => {
    // Filtragem secundária por IVA e TSU
    if (filterIva !== "todos" && cliente.regimeIva !== filterIva) return false;
    if (filterTsu !== "todos" && cliente.tsu_tipo !== filterTsu) return false;

    // Quantas obrigações visíveis este cliente tem marcadas como verdadeiras na ficha?
    const obrigacoesAtivasDoCliente = obrigacoesVisiveis.filter(ob => Boolean(cliente[ob.key as keyof Client]));
    
    // Na vista "Pendentes" ou "Concluídos", exigimos que a empresa tenha obrigações ativas neste quadro
    if (filterEstado !== "todos" && obrigacoesAtivasDoCliente.length === 0) return false;

    const pendentesCount = obrigacoesAtivasDoCliente.filter(ob => {
      const estaConcluido = vistos[`${cliente.id}_${ob.key}`] || false;
      return !estaConcluido;
    }).length;

    if (filterEstado === "pendentes") return pendentesCount > 0;
    if (filterEstado === "concluidos") return pendentesCount === 0 && obrigacoesAtivasDoCliente.length > 0;
    
    return true; // "todos"
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 print:p-0 print:m-0 print:bg-white print:text-black min-h-screen">
      {/* Header idêntico aos Clientes/Colaboradores */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios Mensais</h1>
          <p className="text-muted-foreground mt-1">
            Gestão e acompanhamento das entregas e obrigações.
          </p>
        </div>
        
        <Button onClick={() => window.print()} variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Exportar PDF
        </Button>
      </div>

      {/* Titulo Exclusivo para Impressão */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Relatório Permanente de Obrigações</h1>
        <p className="text-sm mt-1">
          {mesesInfo.find(m => m.value === mes)?.label} de {ano} | Filtro: {filterObrigacao.toUpperCase()} | Estado: {filterEstado.toUpperCase()}
        </p>
      </div>

      {/* Barra de Filtros Separada */}
      <div className="flex flex-col sm:flex-row gap-4 print:hidden flex-wrap">
        <div className="flex bg-card border border-border rounded-xl p-2 gap-3 items-center shadow-sm w-fit flex-shrink-0">
          <Select value={mes.toString()} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-[140px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {mesesInfo.map((m) => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="w-[1px] h-6 bg-border"></div>

          <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-[100px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosInfo.map((a) => (
                <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex bg-card border border-border rounded-xl p-2 gap-3 items-center shadow-sm w-fit flex-shrink-0">
          <Select value={filterObrigacao} onValueChange={setFilterObrigacao}>
            <SelectTrigger className="w-[160px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="Obrigação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas Obrigações</SelectItem>
              {OBRIGACOES.map((ob) => (
                <SelectItem key={ob.key} value={ob.key}>{ob.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-[1px] h-6 bg-border"></div>

          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-[140px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Estados</SelectItem>
              <SelectItem value="pendentes">Por Cumprir (To-Do)</SelectItem>
              <SelectItem value="concluidos">Concluídos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex bg-card border border-border rounded-xl p-2 gap-3 items-center shadow-sm w-fit flex-shrink-0">
          <Select value={filterIva} onValueChange={setFilterIva}>
            <SelectTrigger className="w-[140px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="IVA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos IVA</SelectItem>
              {iVASDisponiveis.map((iva) => (
                <SelectItem key={iva} value={iva}>{iva}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-[1px] h-6 bg-border"></div>

          <Select value={filterTsu} onValueChange={setFilterTsu}>
            <SelectTrigger className="w-[140px] border-none shadow-none font-medium bg-transparent focus:ring-0">
              <SelectValue placeholder="TSU" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as TSU</SelectItem>
              {tsusDisponiveis.map((tsu) => (
                <SelectItem key={tsu} value={tsu}>{tsu}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm print:border-none print:shadow-none">
        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border print:bg-transparent print:text-black">
                <tr>
                  <th className="px-6 py-4 font-semibold text-left">Cliente</th>
                  <th className="px-4 py-4 font-semibold text-left whitespace-nowrap">IVA</th>
                  <th className="px-4 py-4 font-semibold text-left whitespace-nowrap">TSU</th>
                  {obrigacoesVisiveis.map((obrigacao) => (
                    <th key={obrigacao.key} className="px-4 py-4 font-semibold text-center whitespace-nowrap">
                      {obrigacao.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border print:divide-gray-300">
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-muted/50 transition-colors print:break-inside-avoid">
                    <td className="px-6 py-4 font-medium text-foreground whitespace-nowrap print:text-black">
                      {cliente.name}
                      <span className="block text-xs text-muted-foreground font-normal print:hidden">
                        NIF: {cliente.nif || "---"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap print:text-black">
                      {cliente.regimeIva || "---"}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap print:text-black">
                      {cliente.tsu_tipo || "---"}
                    </td>

                    {obrigacoesVisiveis.map((obrigacao) => {
                      const obrigacaoAtiva = Boolean(cliente[obrigacao.key as keyof Client]);
                      const estaConcluido = vistos[`${cliente.id}_${obrigacao.key}`] || false;

                      return (
                        <td key={obrigacao.key} className="px-4 py-4 text-center">
                          {obrigacaoAtiva ? (
                            <div className="flex justify-center print:block text-center">
                                {/* Visivel no Ecrã */}
                                <Checkbox 
                                  checked={estaConcluido}
                                  onCheckedChange={() => alternarVisto(cliente.id!, obrigacao.key, estaConcluido)}
                                  className="mx-auto data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 print:hidden"
                                />
                                {/* Visível apenas no Print */}
                                {estaConcluido ? (
                                    <span className="hidden print:inline-block font-bold text-green-700">✓ Feito</span>
                                ) : (
                                    <span className="hidden print:inline-block font-medium text-red-600">Pendente</span>
                                )}
                            </div>
                          ) : (
                            <div className="w-full h-full flex justify-center items-center">
                              <span className="text-muted-foreground/30 text-lg leading-none select-none print:text-gray-300">-</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                
                {clientesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={obrigacoesVisiveis.length + 3} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhum cliente com esse perfil / estado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RelatoriosPage;
