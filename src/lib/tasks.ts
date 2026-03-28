import { supabase } from "./supabase";
import { Client } from "./clientes";
import { FiscalConfig } from "./fiscal";

export type TaskStatus = "por_fazer" | "em_curso" | "concluida" | "atrasada";
export type Priority = "alta" | "media" | "baixa";
export type Recurrence = "mensal" | "anual" | "pontual";

export interface Task {
  id: string;
  title: string;
  description: string;
  client: string;
  responsible: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  recurrence: Recurrence;
  templateId?: string;
}

export const mapTaskFromDB = (row: any): Task => ({
  id: row.id,
  title: row.title,
  description: row.description || "",
  client: row.client || "",
  responsible: row.responsible || "",
  dueDate: row.due_date || "",
  priority: row.priority as Priority,
  status: row.status as TaskStatus,
  recurrence: row.recurrence as Recurrence,
  templateId: row.template_id || undefined,
});

export const getGhostTasks = (
  clients: Client[], 
  vistos: any[], 
  configs: FiscalConfig[]
): Task[] => {
  if (clients.length === 0) return [];
  
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

  const defaults: any = {
    dmr: { oblig: "DMR", tipo: "mensal", m: null, d: 10 },
    saft: { oblig: "SAF-T", tipo: "mensal", m: null, d: 5 },
    irc: { oblig: "IRC", tipo: "anual", m: 5, d: 31 },
    ies: { oblig: "IES", tipo: "anual", m: 7, d: 15 },
    salarios: { oblig: "Salários", tipo: "mensal", m: null, d: 31 },
    inventario: { oblig: "Inventário", tipo: "anual", m: 1, d: 31 },
    modelo_10: { oblig: "Modelo 10", tipo: "anual", m: 2, d: 10 },
  };

  const ghosts: Task[] = [];
  
  Object.keys(defaults).forEach(obKey => {
    const def = defaults[obKey];
    const cfg = configs.find(c => c.obrigacao === obKey);
    const isMensal = (cfg ? cfg.tipo : def.tipo) === "mensal";
    const mesEntrega = (cfg ? cfg.mes_entrega : def.m) || 1;
    const diaLimite = (cfg ? cfg.dia_limite : def.d) || 31;

    // Se a obrigação não calha neste mês, ignora.
    if (!isMensal && mesEntrega !== mes) return;

    const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(diaLimite).padStart(2, '0')}`;
    const isLate = dateStr < todayStr;

    clients.forEach(c => {
      // @ts-ignore
      if (c.status === "ativo" && c[obKey]) {
        const vistoEncontrado = vistos.find(v => v.cliente_id === c.id && v.obrigacao === obKey);
        let taskStatus: TaskStatus = "por_fazer";
        
        if (vistoEncontrado?.concluido) {
          taskStatus = "concluida";
        } else if (isLate) {
          taskStatus = "atrasada";
        }

        ghosts.push({
          id: `__fiscal__${c.id}__${obKey}__${ano}__${mes}`,
          title: `Obrigação: ${def.oblig}`,
          description: `Entrega de prazo legal - gerada automaticamente.`,
          client: c.name,
          responsible: "Sistema",
          dueDate: dateStr,
          priority: "alta",
          status: taskStatus,
          recurrence: isMensal ? "mensal" : "anual"
        });
      }
    });
  });

  return ghosts;
};
