import { useState, useMemo, useEffect } from "react";
import StatCard from "@/components/StatCard";
import {
  Users,
  ClipboardList,
  Receipt,
  Wallet,
  Bell,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { fetchClients, getCurrentMonthAvencaMovements } from "@/lib/clientes";
import { fetchFiscalConfig } from "@/lib/fiscal";
import { getGhostTasks, mapTaskFromDB } from "@/lib/tasks";

import { supabase } from "@/lib/supabase";

const notifications = [
  { id: 1, text: "Verifique as tarefas pendentes", type: "warning" },
  { id: 2, text: "Adicione os seus clientes para começar", type: "info" },
];

const DashboardPage = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [manualMovements, setManualMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    const loadData = async () => {
      setLoading(true);
      const today = new Date();
      const [clientsData, tasksData, movementsData, configData, vistosData] = await Promise.all([
        fetchClients(),
        supabase.from('tarefas').select('*'),
        supabase.from('movimentos_faturacao').select('*'),
        fetchFiscalConfig(today.getFullYear()),
        supabase.from('relatorios_mensais').select('*').eq('ano', today.getFullYear()).eq('mes', today.getMonth() + 1)
      ]);
      
      const dbTasks = (tasksData.data || []).map(mapTaskFromDB);
      const ghostTasks = getGhostTasks(clientsData, vistosData.data || [], configData);
      
      setClients(clientsData);
      setTasks([...dbTasks, ...ghostTasks]);
      setManualMovements(movementsData.data?.map(m => ({
        type: m.tipo,
        value: Number(m.valor),
        date: m.data
      })) || []);
      setLoading(false);
    };
    loadData();
  }, []);

  const avencaMovements = useMemo(() => getCurrentMonthAvencaMovements(clients), [clients]);

  // Real KPIs
  const totalClientes = clients.length;
  const tarefasAtrasadas = tasks.filter(t => t.status === "atrasada").length;
  const tarefasPendentes = tasks.filter(t => t.status === "por_fazer" || t.status === "em_curso" || t.status === "atrasada").length;

  const totalAvencas = avencaMovements.reduce((s, m) => s + m.value, 0);
  const totalPagamentos = manualMovements.filter(m => m.type === "pagamento").reduce((s, m) => s + m.value, 0);
  const totalFaturas = manualMovements.filter(m => m.type === "fatura").reduce((s, m) => s + m.value, 0);
  const faturacaoMes = totalAvencas + totalFaturas;
  const recebimentos = totalPagamentos;

  const mensagensPendentes = tasks.filter(t => t.title.startsWith("Mensagem de Cliente") && t.status === "por_fazer");

  // Task distribution for chart
  const taskDistribution = useMemo(() => {
    const counts = { concluida: 0, em_curso: 0, atrasada: 0, por_fazer: 0 };
    tasks.forEach(t => { if (counts[t.status as keyof typeof counts] !== undefined) counts[t.status as keyof typeof counts]++; });
    return [
      { name: "Concluídas", value: counts.concluida, color: "hsl(152, 60%, 40%)" },
      { name: "Em Curso", value: counts.em_curso, color: "hsl(210, 80%, 52%)" },
      { name: "Atrasadas", value: counts.atrasada, color: "hsl(0, 72%, 51%)" },
      { name: "Por Fazer", value: counts.por_fazer, color: "hsl(38, 92%, 50%)" },
    ].filter(d => d.value > 0);
  }, [tasks]);

  // Revenue per active client for chart
  const revenueData = useMemo(() => {
    return clients
      .filter(c => c.status === "ativo" && (c.valorAvenca ?? 0) > 0)
      .slice(0, 8)
      .map(c => ({ name: c.name.substring(0, 12), valor: c.valorAvenca ?? 0 }));
  }, [clients]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do gabinete</p>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Clientes" value={totalClientes} icon={<Users className="w-5 h-5" />} />
            <StatCard title="Tarefas Pendentes" value={tarefasPendentes} icon={<ClipboardList className="w-5 h-5" />} />
            <StatCard title="Faturação Mês" value={`€${faturacaoMes.toLocaleString()}`} icon={<Receipt className="w-5 h-5" />} />
            <StatCard title="Recebimentos" value={`€${recebimentos.toLocaleString()}`} icon={<Wallet className="w-5 h-5" />} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 elevated-card rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Avenças por Cliente</h3>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} />
                    <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(0, 0%, 100%)", border: "1px solid hsl(220, 15%, 90%)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number) => [`€${value.toLocaleString()}`, "Avença"]}
                    />
                    <Bar dataKey="valor" fill="hsl(220, 60%, 20%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-20">Adicione clientes com avença para ver o gráfico</p>
              )}
            </div>

            <div className="elevated-card rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição de Tarefas</h3>
              {taskDistribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={taskDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                        {taskDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {taskDistribution.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-medium text-foreground ml-auto">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-20">Crie tarefas para ver a distribuição</p>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="elevated-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
            </div>
            <div className="space-y-3">
              {tarefasAtrasadas > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-destructive animate-pulse" />
                  <p className="text-sm font-semibold italic">{tarefasAtrasadas} TAREFAS EM ATRASO CRÍTICO!</p>
                </div>
              )}
              {mensagensPendentes.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-accent animate-bounce" />
                  <div>
                    <p className="text-sm font-bold">Novas Mensagens de Clientes!</p>
                    <p className="text-xs mt-1">Existem {mensagensPendentes.length} mensagens por responder.</p>
                  </div>
                </div>
              )}
              {tarefasPendentes > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-warning" />
                  <p className="text-sm text-foreground">{tarefasPendentes} tarefas pendentes no sistema</p>
                </div>
              )}
              {totalClientes === 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-info" />
                  <p className="text-sm text-foreground">Adicione os seus clientes para começar</p>
                </div>
              )}
              {totalClientes > 0 && tarefasPendentes === 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-success" />
                  <p className="text-sm text-foreground">Tudo em dia! Nenhuma tarefa pendente.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
