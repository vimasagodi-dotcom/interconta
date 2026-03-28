import { supabase } from "./supabase";

export interface Client {
  id: string; // no supabase é UUID, mas mapemos para string
  numeroCliente: string;
  name: string;
  nif: string;
  email: string;
  phone: string;
  type: string;
  status: "ativo" | "suspenso";
  saldo: number;
  regimeIva: string;
  regime_contabilidade?: string;
  morada?: string;
  codigoPostal?: string;
  localidade?: string;
  valorAvenca?: number | null;
  dmr?: boolean;
  saft?: boolean;
  irc?: boolean;
  ies?: boolean;
  tsu_tipo?: string;
  decl_trimestral_tsu?: boolean;
  salarios?: boolean;
  inventario?: boolean;
  modelo_10?: boolean;
  inscrito_vies?: boolean;
  rcbe?: string;
  validade_rcbe?: string;
  codigo_certidao_permanente?: string;
  validade_certidao_permanente?: string;
  observacoes?: string;
  avenca_automatica?: boolean;
  access_faturacao?: boolean;
  access_documentos?: boolean;
  user_id?: string;
}

export type BillingMovementType = "avenca" | "fatura" | "pagamento";

export interface BillingMovement {
  id: string;
  date: string;
  type: BillingMovementType;
  description: string;
  value: number;
  client: string;
  client_id?: string;
  pdf_link?: string;
  toconline_id?: string;
}

export const fetchMovements = async (clientId?: string): Promise<BillingMovement[]> => {
  let query = supabase.from("movimentos_faturacao").select(`
    *,
    clientes (name)
  `);
  
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  
  const { data, error } = await query.order("data", { ascending: false });
  
  if (error) {
    console.error("Erro a carregar movimentos:", error);
    return [];
  }
  
  return data.map(m => ({
    id: m.id,
    date: m.data,
    type: m.tipo as BillingMovementType,
    description: m.descricao,
    value: Number(m.valor),
    client: m.clientes?.name || "Desconhecido",
    client_id: m.client_id,
    pdf_link: m.pdf_link,
    toconline_id: m.toconline_id
  }));
};

export const createMovement = async (movement: Omit<BillingMovement, "id" | "client">): Promise<boolean> => {
  const { error } = await supabase.from("movimentos_faturacao").insert([{
    client_id: movement.client_id,
    tipo: movement.type,
    data: movement.date,
    descricao: movement.description,
    valor: movement.value,
    pdf_link: movement.pdf_link
  }]);
  
  if (error) {
    console.error("Erro a criar movimento:", error);
    return false;
  }
  return true;
};

export const fetchClients = async (): Promise<Client[]> => {
  const { data, error } = await supabase.from("clientes").select("*").order("name");
  if (error) {
    console.error("Erro a carregar clientes:", error);
    return [];
  }
  return data || [];
};

export const createClient = async (client: Omit<Client, "id">): Promise<Client | null> => {
  const { data, error } = await supabase.from("clientes").insert([client]).select().single();
  if (error) {
    console.error("Erro a criar cliente:", error);
    return null;
  }
  return data;
};

export const updateClient = async (id: string, updates: Partial<Client>): Promise<Client | null> => {
  const { data, error } = await supabase.from("clientes").update(updates).eq("id", id).select().single();
  if (error) {
    console.error("Erro a atualizar cliente:", error);
    return null;
  }
  return data;
};

// As avencas movements remain the same logic, but eles tomam o array de clientes async.
const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthEndDate = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const getCurrentMonthAvencaMovements = (
  clients: Client[],
  now = new Date(),
): BillingMovement[] => {
  const monthEnd = getMonthEndDate(now);
  const label = formatMonthLabel(now);
  const date = toIsoDate(monthEnd);

  return clients
    .filter((client) => client.status === "ativo" && (client.valorAvenca ?? 0) > 0 && (client.avenca_automatica !== false))
    .map((client) => ({
      id: `avenca-${client.id}-${date}`,
      date,
      type: "avenca" as const,
      description: `Avença ${label} - ${client.name}`,
      value: Number(client.valorAvenca),
      client: client.name,
    }));
};

export const getRecurringAvencaMovements = (
  clients: Client[],
  months: number = 6
): BillingMovement[] => {
  const movements: BillingMovement[] = [];
  const now = new Date();
  
  clients.forEach(client => {
    if (client.status !== "ativo" || !client.valorAvenca || client.avenca_automatica === false) return;
    
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const label = date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
      const dateStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
      
      movements.push({
        id: `avenca-${client.id}-${dateStr}`,
        date: dateStr,
        type: "avenca",
        description: `Avença ${label} - ${client.name}`,
        value: Number(client.valorAvenca),
        client: client.name,
      });
    }
  });
  
  return movements;
};

export const triggerToconlineSync = async (): Promise<{ success: boolean; count?: number; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('sync-toconline');
    
    if (error) {
      console.error("Erro ao invocar Edge Function:", error);
      return { success: false, error: error.message };
    }
    
    return { success: true, count: data?.count || 0 };
  } catch (err: any) {
    console.error("Erro inesperado na sincronização:", err);
    return { success: false, error: err.message || "Erro de rede" };
  }
};

