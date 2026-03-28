import { supabase } from "./supabase";

export interface FiscalConfig {
  id: string;
  ano: number;
  obrigacao: string;
  tipo: "mensal" | "anual";
  mes_entrega: number | null; // 1 to 12 if anual
  dia_limite: number;
}

export const fetchFiscalConfig = async (ano: number): Promise<FiscalConfig[]> => {
  const { data, error } = await supabase
    .from("fiscal_config")
    .select("*")
    .eq("ano", ano);

  if (error) {
    if (error.code !== "42P01") { // Ignore table missing error during local dev pre-setup
        console.error("Erro a carregar configurações fiscais:", error);
    }
    return [];
  }
  return data as FiscalConfig[];
};

export const saveFiscalConfig = async (config: Partial<FiscalConfig>): Promise<{ success: boolean; error?: any }> => {
  if (config.id) {
    // Update existing
    const { error } = await supabase
      .from("fiscal_config")
      .update({
        tipo: config.tipo,
        mes_entrega: config.mes_entrega,
        dia_limite: config.dia_limite
      })
      .eq("id", config.id);

    return { success: !error, error };
  } else {
    // Insert new
    const { error } = await supabase
      .from("fiscal_config")
      .insert({
        ano: config.ano,
        obrigacao: config.obrigacao,
        tipo: config.tipo,
        mes_entrega: config.mes_entrega,
        dia_limite: config.dia_limite
      });

    return { success: !error, error };
  }
};
