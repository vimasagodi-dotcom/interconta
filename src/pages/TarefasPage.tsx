import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Search, Calendar, User, Building, ClipboardList, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchClients, Client } from "@/lib/clientes";
import { supabase } from "@/lib/supabase";
import { fetchFiscalConfig } from "@/lib/fiscal";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { 
  Task, 
  TaskStatus, 
  Priority, 
  Recurrence, 
  mapTaskFromDB, 
  getGhostTasks 
} from "@/lib/tasks";

const columns: { key: TaskStatus; label: string; color: string }[] = [
  { key: "por_fazer", label: "Por Fazer", color: "bg-warning" },
  { key: "em_curso", label: "Em Curso", color: "bg-info" },
  { key: "concluida", label: "Concluída", color: "bg-success" },
  { key: "atrasada", label: "Atrasada", color: "bg-destructive" },
];

const priorityConfig: Record<Priority, { label: string; class: string }> = {
  alta: { label: "Alta", class: "bg-destructive/10 text-destructive border-destructive/20" },
  media: { label: "Média", class: "bg-warning/10 text-warning border-warning/20" },
  baixa: { label: "Baixa", class: "bg-info/10 text-info border-info/20" },
};

const recurrenceLabels: Record<Recurrence, string> = {
  mensal: "Mensal",
  anual: "Anual",
  pontual: "Pontual",
};

const statusOptions: { key: TaskStatus; label: string }[] = [
  { key: "por_fazer", label: "Por Fazer" },
  { key: "em_curso", label: "Em Curso" },
  { key: "concluida", label: "Concluída" },
  { key: "atrasada", label: "Atrasada" },
];

// mapTaskFromDB was here, removed as it is now imported.

const TarefasPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [clients, setClients] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [client, setClient] = useState("");
  const [responsible, setResponsible] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [priority, setPriority] = useState<Priority>("media");
  const [recurrence, setRecurrence] = useState<Recurrence>("pontual");
  const [linkObligation, setLinkObligation] = useState<string>("");

  // Ghost Tasks States
  const [ghostTasks, setGhostTasks] = useState<Task[]>([]);
  const [vistos, setVistos] = useState<any[]>([]);

  useEffect(() => {
    fetchClients().then(setClients);
    supabase.from('colaboradores').select('name').order('name').then(({data}) => {
      if(data) setColaboradores(data);
    });
    // For Ghost Tasks we need current reports
    const today = new Date();
    supabase.from('relatorios_mensais').select('*').eq('ano', today.getFullYear()).eq('mes', today.getMonth() + 1).then(({data}) => {
      if(data) setVistos(data);
    });
  }, []);

  const loadTarefas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tarefas').select('*').order('created_at', { ascending: false });
    if (error) {
      toast.error("Erro a carregar tarefas da cloud");
      setLoading(false);
      return;
    }
    
    let dbTasks = (data || []).map(mapTaskFromDB);
    
    // Gerar instâncias do mês atual para avenças que sejam templates
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyTemplates = dbTasks.filter(t => t.recurrence === "mensal" && !t.templateId);
    
    const newInstances: any[] = [];
    for (const template of monthlyTemplates) {
      const instanceExists = dbTasks.some(t => t.templateId === template.id && t.dueDate.startsWith(monthKey));
      if (!instanceExists) {
        newInstances.push({
          id: crypto.randomUUID(),
          title: template.title,
          description: template.description || null,
          client: template.client || null,
          responsible: template.responsible || null,
          due_date: `${monthKey}-01`,
          priority: "alta",
          status: "por_fazer",
          recurrence: "mensal",
          template_id: template.id,
        });
      }
    }

    if (newInstances.length > 0) {
      await supabase.from('tarefas').insert(newInstances);
      dbTasks = [...newInstances.map(mapTaskFromDB), ...dbTasks];
    }
    
    setTasks(dbTasks);
    setLoading(false);
  };

  const generateGhostTasks = async () => {
    const today = new Date();
    const configs = await fetchFiscalConfig(today.getFullYear());
    const ghosts = getGhostTasks(clients, vistos, configs);
    setGhostTasks(ghosts);
  };

  useEffect(() => { loadTarefas(); }, []);
  useEffect(() => { generateGhostTasks(); }, [clients, vistos]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setClient(""); setResponsible(""); setDueDate(new Date().toISOString().split("T")[0]); setPriority("media"); setRecurrence("pontual");
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("O título é obrigatório"); return; }
    
    let finalDescription = description.trim();
    if (linkObligation && client) {
      const selectedClient = clients.find(c => c.name === client);
      if (selectedClient) {
        const now = new Date();
        finalDescription += `\n\n[FISCAL_LINK:${selectedClient.id}:${linkObligation}:${now.getFullYear()}:${now.getMonth() + 1}]`;
      }
    }

    const newTask = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: finalDescription || null,
      client: client || null,
      responsible: responsible || null,
      due_date: dueDate || null,
      priority,
      status: "por_fazer",
      recurrence,
      template_id: null,
    };
    
    const inserts = [newTask];
    
    if (recurrence === "mensal") {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      inserts.push({
        id: crypto.randomUUID(),
        title: newTask.title,
        description: newTask.description,
        client: newTask.client,
        responsible: newTask.responsible,
        due_date: `${monthKey}-01`,
        priority: "alta",
        status: "por_fazer",
        recurrence: "mensal",
        template_id: newTask.id,
      });
    }

    toast.info("A criar tarefa...", { id: "tarefa" });
    const { error } = await supabase.from('tarefas').insert(inserts);
    
    if (error) {
      toast.error("Erro ao gravar tarefa na DB", { id: "tarefa" });
    } else {
      toast.success("Tarefa sincronizada!", { id: "tarefa" });
      setTasks(prev => [...inserts.map(mapTaskFromDB), ...prev]);
      setDialogOpen(false);
      resetForm();
    }
  };

  const changeStatus = async (taskId: string, newStatus: TaskStatus) => {
    if (taskId.startsWith("__fiscal__")) {
      // Intercept Ghost Task Status Change to write directly to relatorios_mensais
      // New task ID format: __fiscal__${clienteId}__${obKey}__${ano}__${mes}
      const parts = taskId.split("__");
      const clienteId = parts[2];
      const obKey = parts[3];
      const taskAno = parseInt(parts[4]);
      const taskMes = parseInt(parts[5]);
      
      const isDone = newStatus === "concluida";
      
      // Update local ghost array temporarily
      setGhostTasks(prev => prev.map(g => g.id === taskId ? { ...g, status: newStatus } : g));
      setDetailTask(prev => prev ? { ...prev, status: newStatus } : null);
      
      try {
        if (isDone) {
          await supabase.from("relatorios_mensais").upsert({
            cliente_id: clienteId,
            ano: taskAno,
            mes: taskMes,
            obrigacao: obKey,
            concluido: true,
            data_conclusao: new Date().toISOString(),
            tecnico: user?.name || user?.email || "Desconhecido"
          }, { onConflict: 'cliente_id,ano,mes,obrigacao' });
          toast.success("Obrigação concluída, Relatórios atualizados!");
        } else {
          await supabase.from("relatorios_mensais").delete()
            .eq("cliente_id", clienteId)
            .eq("ano", taskAno)
            .eq("mes", taskMes)
            .eq("obrigacao", obKey);
          toast.info("Visto removido dos Relatórios mensais.");
        }
      } catch (err) {
        toast.error("Erro na sincronização da obrigação");
      }
      return;
    }

    const updateData: any = { status: newStatus };
    const userName = user?.name || user?.email || "Desconhecido";
    
    if (newStatus === "concluida") {
      updateData.responsible = userName;
      
      // Check for fiscal link in description
      if (detailTask?.description?.includes("[FISCAL_LINK:")) {
        const match = detailTask.description.match(/\[FISCAL_LINK:([^:]+):([^:]+):([^:]+):([^:]+)\]/);
        if (match) {
          const [, clienteId, obKey, taskAno, taskMes] = match;
          await supabase.from("relatorios_mensais").upsert({
            cliente_id: clienteId,
            ano: parseInt(taskAno),
            mes: parseInt(taskMes),
            obrigacao: obKey,
            concluido: true,
            data_conclusao: new Date().toISOString(),
            tecnico: userName
          }, { onConflict: 'cliente_id,ano,mes,obrigacao' });
        }
      }
    } else if (newStatus === "por_fazer" || newStatus === "atrasada") {
       // Optional: Remove seen mark if task is reopened?
       if (detailTask?.description?.includes("[FISCAL_LINK:")) {
        const match = detailTask.description.match(/\[FISCAL_LINK:([^:]+):([^:]+):([^:]+):([^:]+)\]/);
        if (match) {
          const [, clienteId, obKey, taskAno, taskMes] = match;
          await supabase.from("relatorios_mensais").delete()
            .eq("cliente_id", clienteId)
            .eq("ano", parseInt(taskAno))
            .eq("mes", parseInt(taskMes))
            .eq("obrigacao", obKey);
        }
      }
    }

    const { error } = await supabase.from('tarefas').update(updateData).eq('id', taskId);
    if (error) {
      toast.error("Erro ao atualizar o estado.");
      return;
    }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updateData } : t));
    setDetailTask(prev => prev ? { ...prev, ...updateData } : null);
    toast.success("Estado atualizado");
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Tem a certeza que quer apagar definitivamente esta tarefa da Cloud?")) return;
    const { error } = await supabase.from('tarefas').delete().eq('id', taskId);
    if (!error) {
       setTasks(prev => prev.filter(t => t.id !== taskId));
       setDetailTask(null);
       toast.success("Tarefa removida!");
    }
  };

  const visibleTasks = tasks.filter(t => {
    if (t.recurrence === "mensal" && !t.templateId) return false;
    return true;
  });

  const allVisibleTasks = [...visibleTasks, ...ghostTasks];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
          <p className="text-muted-foreground mt-1">
             {loading ? "A carregar tarefas da Cloud..." : `${allVisibleTasks.length} tarefas atribuídas`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/lancamentos")}>
            <ClipboardList className="w-4 h-4" />
            Lançamentos
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)} disabled={loading}>
            <Plus className="w-4 h-4" />
            Nova Tarefa
          </Button>
        </div>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Pesquisar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colTasks = allVisibleTasks.filter(
            (t) => t.status === col.key && ((t.title?.toLowerCase() || "").includes(search.toLowerCase()) || (t.client?.toLowerCase() || "").includes(search.toLowerCase()))
          );
          return (
            <div key={col.key} className="flex flex-col min-w-[300px]">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
                <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                <span className="ml-auto text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{colTasks.length}</span>
              </div>
              <div className="space-y-3 mt-3 flex-grow">
                {colTasks.map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="elevated-card rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer space-y-3 relative"
                    onClick={() => setDetailTask(task)}
                  >
                    {task.id.startsWith("__fiscal__") && (
                      <div className="absolute top-0 right-0 p-1.5 opacity-50">
                        <Building className="w-3 h-3 text-primary" />
                      </div>
                    )}
                    
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-medium text-foreground leading-tight">{task.title}</h4>
                      <Badge variant="outline" className={cn("text-[10px] flex-shrink-0 ml-2", priorityConfig[task.priority]?.class)}>
                        {priorityConfig[task.priority]?.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                       {task.description?.split("\n\n[FISCAL_LINK")[0]}
                    </p>
                    <div className="space-y-1.5">
                      {task.client && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building className="w-3 h-3" />
                          <span>{task.client}</span>
                        </div>
                      )}
                      {task.responsible && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span>{task.responsible}</span>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(task.dueDate).toLocaleDateString("pt-PT")}</span>
                        </div>
                      )}
                      <Badge variant="secondary" className="text-[10px] mt-1">
                        {recurrenceLabels[task.recurrence]}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Task Detail */}
      <Dialog open={!!detailTask} onOpenChange={(open) => { if (!open) setDetailTask(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base pr-8">{detailTask?.title}</DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4">
              {detailTask.description && (
                <p className="text-sm text-muted-foreground">
                  {detailTask.description.split("\n\n[FISCAL_LINK")[0]}
                </p>
              )}
              <div className="space-y-1.5 text-sm">
                {detailTask.client && <p><span className="text-muted-foreground">Cliente:</span> {detailTask.client}</p>}
                {detailTask.responsible && <p><span className="text-muted-foreground">Responsável:</span> {detailTask.responsible}</p>}
                {detailTask.dueDate && <p><span className="text-muted-foreground">Data Límite:</span> {new Date(detailTask.dueDate).toLocaleDateString("pt-PT")}</p>}
                <p><span className="text-muted-foreground">Periodicidade:</span> {recurrenceLabels[detailTask.recurrence]}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Marcar como:</Label>
                <Select value={detailTask.status} onValueChange={(v) => changeStatus(detailTask.id, v as TaskStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Alterar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem 
                        key={s.key} 
                        value={s.key}
                        // Ghost Tasks only toggle between Done and Todo roughly
                        disabled={detailTask.id.startsWith("__fiscal__") && s.key === "em_curso"}
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-4 mt-2 border-t border-border flex justify-end">
                {!detailTask.id.startsWith("__fiscal__") && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(detailTask.id)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar Tarefa
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Tarefa */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Enviar declaração IVA" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes da tarefa" />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente (opcional)" /></SelectTrigger>
                <SelectContent>
                  {clients.filter((c) => c.status === "ativo").map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsible} onValueChange={setResponsible}>
                <SelectTrigger><SelectValue placeholder="Atribuir a colega" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c, idx) => (
                     <SelectItem key={idx} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data limite</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Label className="text-xs text-primary font-semibold">Vincular a Obrigação Fiscal (Relatórios)</Label>
              <Select value={linkObligation} onValueChange={setLinkObligation}>
                <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Nenhuma vinculação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma vinculação</SelectItem>
                  <SelectItem value="dmr">DMR</SelectItem>
                  <SelectItem value="saft">SAF-T</SelectItem>
                  <SelectItem value="irc">IRC</SelectItem>
                  <SelectItem value="ies">IES</SelectItem>
                  <SelectItem value="salarios">Salários</SelectItem>
                  <SelectItem value="inventario">Inventário</SelectItem>
                  <SelectItem value="modelo_10">Modelo 10</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Ao selecionar, marcar esta tarefa como concluída colocará automaticamente o "visto" no relatório do mês atual para este cliente.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <RadioGroup value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="mensal" id="mensal" />
                  <Label htmlFor="mensal" className="font-normal cursor-pointer">Mensal</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="anual" id="anual" />
                  <Label htmlFor="anual" className="font-normal cursor-pointer">Anual</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pontual" id="pontual" />
                  <Label htmlFor="pontual" className="font-normal cursor-pointer">Pontual</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Submeter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TarefasPage;
