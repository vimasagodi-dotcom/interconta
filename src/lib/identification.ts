import { Client } from "./clientes";
import { supabase } from "./supabase";

/**
 * Normalizes a string by removing accents, special characters and extra spaces.
 */
export const normalizeString = (str: string): string => {
  return str
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") // Replace punctuation with space
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim() || "";
};

/**
 * Detects if a message indicates a desire to close or resolve a task.
 */
export const isClosingIntent = (message: string): boolean => {
  const normalized = normalizeString(message);
  const closingPhrases = [
    "obrigado", "obrigada", "resolvido", "concluido", "concluida", "feito", 
    "tudo ok", "pode fechar", "esta tratado", "esta feito", "valeu", "thanks", "ok basta", "resolva"
  ];
  
  // Exact match or ends with the phrase
  return closingPhrases.some(phrase => normalized === phrase || normalized.endsWith(" " + phrase));
};

/**
 * Robust client identification engine.
 * Tries multiple strategies to find a client in the database.
 */
export const identifyClient = async (identifier: {
  id?: string;
  nif?: string;
  name?: string;
  messageContent?: string;
}): Promise<Client | null> => {
  // 1. Priority: Direct ID lookup
  if (identifier.id) {
    const { data } = await supabase.from("clientes").select("*").eq("id", identifier.id).maybeSingle();
    if (data) return data;
  }

  // 2. Priority: NIF lookup (Explicit or extracted from content)
  let nifToTry = identifier.nif;
  if (!nifToTry && identifier.messageContent) {
    const nifMatch = identifier.messageContent.match(/\b\d{9}\b/);
    if (nifMatch) nifToTry = nifMatch[0];
  }

  if (nifToTry) {
    const { data } = await supabase.from("clientes").select("*").eq("nif", nifToTry.trim()).maybeSingle();
    if (data) return data;
  }

  // 3. Fallback: Search in message history (if content is provided)
  // This helps if the task name is generic but the content is unique
  if (identifier.messageContent) {
    const { data: msgMatch } = await supabase
      .from("mensagens")
      .select("client_id")
      .eq("text", identifier.messageContent)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (msgMatch?.client_id) {
      const { data: client } = await supabase.from("clientes").select("*").eq("id", msgMatch.client_id).maybeSingle();
      if (client) return client;
    }
  }

  // 4. Fallback: Fuzzy Name Matching
  const targetName = normalizeString(identifier.name || "");
  if (!targetName || targetName === "cliente" || targetName === "utilizador") return null;

  const { data: allClients } = await supabase.from("clientes").select("*");
  if (!allClients) return null;

  // Exact normalized match
  let match = allClients.find(c => normalizeString(c.name) === targetName);
  if (match) return match;

  // Token-based fuzzy match
  const getTokens = (s: string) => s.split(" ").filter(t => t.length > 2);
  const targetTokens = getTokens(targetName);

  if (targetTokens.length >= 2) {
    match = allClients.find(c => {
      const clientNameNorm = normalizeString(c.name);
      const matches = targetTokens.filter(token => clientNameNorm.includes(token));
      return matches.length >= 2;
    });
    if (match) return match;
  }

  // Containment match
  if (targetName.length > 4) {
    match = allClients.find(c => {
      const clientNameNorm = normalizeString(c.name);
      return clientNameNorm.includes(targetName) || targetName.includes(clientNameNorm);
    });
    if (match) return match;
  }

  return null;
};
