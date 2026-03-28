import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing from environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Cliente REST direto para Admin API (evita o bloqueio "Forbidden key" do package supabase-js no browser).
 * Isto permite atribuir contas de login livremente no Admin panel (bypass RLS / bypass email / sem logout).
 */
export const adminAuth = {
  createUser: async (payload: any) => {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      return { error: { message: err.message || err.error_description || "Erro na criação de auth" } };
    }
    const data = await res.json();
    return { data: { user: data }, error: null };
  },

  updateUserById: async (uid: string, payload: any) => {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
      method: "PUT",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      return { error: { message: err.message || err.error_description || "Erro na atualização" } };
    }
    const data = await res.json();
    return { data: { user: data }, error: null };
  },

  deleteUser: async (uid: string) => {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      }
    });
    if (!res.ok) {
      const err = await res.json();
      return { error: { message: err.message || err.error_description || "Erro ao apagar Auth" } };
    }
    return { error: null };
  }
};
