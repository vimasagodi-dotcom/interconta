import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { type Client } from "@/lib/clientes";

export type UserRole = "admin" | "colaborador" | "cliente";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  impersonate: (client: Client | null) => void;
  impersonatedClient: Client | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedClient, setImpersonatedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // Mapeia o utilizador retornado do Supabase para o nosso interface User
  const formatUser = (sessionUser: any): User => ({
    id: sessionUser.id,
    email: sessionUser.email || "",
    name: sessionUser.user_metadata?.name || "Utilizador",
    role: (sessionUser.user_metadata?.role as UserRole) || "admin",
  });

  useEffect(() => {
    // Busca a sessão atual quando a página carrega
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(formatUser(session.user));
      }
      setLoading(false);
    });

    // Fica a ouvir alterações no Auth (login, logout, token atualizado)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(formatUser(session.user));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error("Erro no login:", error.message);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Exceção no login:", error);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setImpersonatedClient(null);
  };

  const impersonate = (client: Client | null) => {
    setImpersonatedClient(client);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      impersonate, 
      impersonatedClient, 
      isAuthenticated: !!user, 
      loading 
    }}>
        {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used dentro do AuthProvider");
  return ctx;
}
