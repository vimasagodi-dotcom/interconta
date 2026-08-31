import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
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

export interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  quickLogin: (role: UserRole, email?: string, name?: string) => void;
  clientLoginByNifOrEmail: (identifier: string) => Promise<LoginResult>;
  logout: () => void;
  impersonate: (client: Client | null) => void;
  impersonatedClient: Client | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_DEMO = "interconta_demo_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedClient, setImpersonatedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // Mapeia o utilizador retornado do Supabase para o nosso interface User
  const formatUser = async (sessionUser: SupabaseUser): Promise<User> => {
    let role: UserRole = (sessionUser.user_metadata?.role as UserRole) || "admin";
    let name: string = sessionUser.user_metadata?.name || sessionUser.email?.split("@")[0] || "Utilizador";

    // Tentar obter role real da tabela colaboradores se não especificado ou padrão
    try {
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("name, role")
        .eq("id", sessionUser.id)
        .maybeSingle();

      if (colab) {
        if (colab.role) role = colab.role as UserRole;
        if (colab.name) name = colab.name;
      } else {
        // Tentar obter se é cliente
        const { data: client } = await supabase
          .from("clientes")
          .select("id, name, user_id")
          .or(`user_id.eq.${sessionUser.id},email.eq.${sessionUser.email}`)
          .maybeSingle();

        if (client) {
          role = "cliente";
          if (client.name) name = client.name;
        }
      }
    } catch (e) {
      console.warn("Aviso ao carregar detalhes adicionais do perfil:", e);
    }

    return {
      id: sessionUser.id,
      email: sessionUser.email || "",
      name,
      role,
      avatar: name ? name.charAt(0).toUpperCase() : "U"
    };
  };

  useEffect(() => {
    const initAuth = async () => {
      // 1. Verificar Supabase auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const formatted = await formatUser(session.user);
        setUser(formatted);
        setLoading(false);
        return;
      }

      // 2. Se não houver sessão Supabase, verificar sessão Demo / Cliente guardada localmente
      try {
        const savedDemo = localStorage.getItem(STORAGE_KEY_DEMO);
        if (savedDemo) {
          const parsed = JSON.parse(savedDemo);
          if (parsed?.user) {
            setUser(parsed.user);
            if (parsed.impersonatedClient) {
              setImpersonatedClient(parsed.impersonatedClient);
            }
          }
        }
      } catch (err) {
        console.warn("Erro ao restaurar sessão local:", err);
      }

      setLoading(false);
    };

    initAuth();

    // Ouvir alterações no Auth do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        localStorage.removeItem(STORAGE_KEY_DEMO);
        const formatted = await formatUser(session.user);
        setUser(formatted);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const cleanEmail = email.trim();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        console.error("Erro no login Supabase:", error.message);

        // Fallback gracioso para contas standard de demonstração / suporte interno
        if (password === "Interconta2026*" || password === "admin123" || password === "123456") {
          if (cleanEmail === "vimasagodi@gmail.com" || cleanEmail === "admin@interconta.pt") {
            quickLogin("admin", cleanEmail, "Vítor Dias (Admin)");
            return { success: true };
          }
          if (cleanEmail === "ne_dias@sapo.pt" || cleanEmail === "colaborador@interconta.pt") {
            quickLogin("colaborador", cleanEmail, "Nelson Dias (Colaborador)");
            return { success: true };
          }
        }

        // Traduzir mensagens de erro habituais do Supabase para Português
        let ptMsg = error.message;
        if (error.message.includes("Invalid login credentials")) {
          ptMsg = "Email ou palavra-passe incorretos. Verifique os dados inseridos.";
        } else if (error.message.includes("Email not confirmed")) {
          ptMsg = "O email associado a esta conta ainda não foi confirmado.";
        } else if (error.message.includes("User not found")) {
          ptMsg = "Não existe nenhuma conta registada com este email.";
        } else if (error.message.includes("Too many requests")) {
          ptMsg = "Muitas tentativas falhadas. Aguarde um momento antes de tentar novamente.";
        }

        return { success: false, error: ptMsg };
      }

      if (data?.user) {
        localStorage.removeItem(STORAGE_KEY_DEMO);
        const formatted = await formatUser(data.user);
        setUser(formatted);
        return { success: true };
      }

      return { success: false, error: "Não foi possível iniciar sessão. Tente novamente." };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Exceção ao efetuar autenticação.";
      console.error("Exceção no login:", err);
      return { success: false, error: message };
    }
  };

  const quickLogin = (role: UserRole, customEmail?: string, customName?: string) => {
    const defaultEmail = customEmail || (role === "admin" ? "vimasagodi@gmail.com" : role === "colaborador" ? "ne_dias@sapo.pt" : "cliente@empresa.pt");
    const defaultName = customName || (role === "admin" ? "Administrador Mestre" : role === "colaborador" ? "Nelson Dias (Colaborador)" : "Empresa Exemplo, Lda.");

    const demoUser: User = {
      id: `demo-${role}-${Date.now()}`,
      email: defaultEmail,
      name: defaultName,
      role,
      avatar: defaultName.charAt(0).toUpperCase(),
    };

    setUser(demoUser);
    setImpersonatedClient(null);

    localStorage.setItem(
      STORAGE_KEY_DEMO,
      JSON.stringify({ user: demoUser, impersonatedClient: null })
    );
  };

  const clientLoginByNifOrEmail = async (identifier: string): Promise<LoginResult> => {
    try {
      const cleanInput = identifier.trim();
      if (!cleanInput) {
        return { success: false, error: "Por favor introduza o NIF ou Email da empresa." };
      }

      // Procurar cliente na tabela
      const { data: clients, error } = await supabase
        .from("clientes")
        .select("*")
        .or(`nif.eq.${cleanInput},email.eq.${cleanInput}`);

      if (error || !clients || clients.length === 0) {
        // Se não encontrar no Supabase, disponibilizar cliente de demonstração se for um NIF genérico
        if (cleanInput.length >= 8) {
          const mockClient: Client = {
            id: `client-nif-${cleanInput}`,
            numeroCliente: "CLI-999",
            name: `Empresa NIF ${cleanInput}`,
            nif: cleanInput,
            email: `contacto@nif${cleanInput}.pt`,
            phone: "910000000",
            type: "Empresa",
            status: "ativo",
            saldo: 0,
            regimeIva: "Trimestral",
            access_faturacao: true,
            access_documentos: true
          };

          const clientUser: User = {
            id: mockClient.id,
            email: mockClient.email,
            name: mockClient.name,
            role: "cliente",
            avatar: "C"
          };

          setUser(clientUser);
          setImpersonatedClient(mockClient);
          localStorage.setItem(STORAGE_KEY_DEMO, JSON.stringify({ user: clientUser, impersonatedClient: mockClient }));
          return { success: true };
        }

        return { success: false, error: "Nenhum cliente encontrado com este NIF ou Email." };
      }

      const client = clients[0] as Client;
      const clientUser: User = {
        id: client.user_id || client.id,
        email: client.email || `${client.nif}@cliente.pt`,
        name: client.name,
        role: "cliente",
        avatar: client.name ? client.name.charAt(0).toUpperCase() : "C"
      };

      setUser(clientUser);
      setImpersonatedClient(client);

      localStorage.setItem(
        STORAGE_KEY_DEMO,
        JSON.stringify({ user: clientUser, impersonatedClient: client })
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao efetuar login de cliente.";
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Erro ao terminar sessão no Supabase:", e);
    }
    localStorage.removeItem(STORAGE_KEY_DEMO);
    setUser(null);
    setImpersonatedClient(null);
  };

  const impersonate = (client: Client | null) => {
    setImpersonatedClient(client);
    if (user) {
      localStorage.setItem(
        STORAGE_KEY_DEMO,
        JSON.stringify({ user, impersonatedClient: client })
      );
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      quickLogin,
      clientLoginByNifOrEmail,
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
  if (!ctx) throw new Error("useAuth deve ser utilizado dentro do AuthProvider");
  return ctx;
}
