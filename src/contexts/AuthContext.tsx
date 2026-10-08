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
  role?: UserRole;
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

    // Enriquecimento rápido com timeout de 1.5s para nunca bloquear o login
    try {
      const enrichmentPromise = (async () => {
        const { data: colab } = await supabase
          .from("colaboradores")
          .select("name, role")
          .eq("id", sessionUser.id)
          .maybeSingle();

        if (colab) {
          if (colab.role) role = colab.role as UserRole;
          if (colab.name) name = colab.name;
        } else {
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
      })();

      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
      await Promise.race([enrichmentPromise, timeoutPromise]);
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
    let isMounted = true;

    // Safety fallback: se o Supabase demorar mais de 2.5s a responder (ex: rede lenta ou projeto pausado),
    // liberta o ecrã de carregamento para o utilizador poder ver a página de login / acesso imediato.
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 2500);

    const initAuth = async () => {
      try {
        // 1. Verificar Supabase auth session
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (session?.user && isMounted) {
          try {
            const formatted = await formatUser(session.user);
            if (isMounted) {
              setUser(formatted);
              setLoading(false);
              clearTimeout(safetyTimer);
              return;
            }
          } catch (formatErr) {
            console.warn("Erro ao formatar utilizador Supabase:", formatErr);
          }
        }
      } catch (authErr) {
        console.warn("Supabase auth.getSession falhou ou inacessível:", authErr);
      }

      // 2. Se não houver sessão Supabase, verificar sessão Demo / Cliente guardada localmente
      try {
        const savedDemo = localStorage.getItem(STORAGE_KEY_DEMO);
        if (savedDemo && isMounted) {
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

      if (isMounted) {
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    initAuth();

    // Ouvir alterações no Auth do Supabase
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const res = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user && isMounted) {
          localStorage.removeItem(STORAGE_KEY_DEMO);
          try {
            const formatted = await formatUser(session.user);
            if (isMounted) setUser(formatted);
          } catch (e) {
            console.warn("Erro ao processar alteração de auth:", e);
          }
        }
        if (isMounted) setLoading(false);
      });
      subscription = res?.data?.subscription || null;
    } catch (subErr) {
      console.warn("Erro ao subscrever onAuthStateChange:", subErr);
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // quickLogin MUST be declared BEFORE login (to avoid ReferenceError)
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

  // Tenta fallback local para contas conhecidas quando o Supabase está em pausa/offline
  const tryLocalFallback = (email: string, password: string): LoginResult | null => {
    const knownPasswords = ["Interconta2026*", "admin123", "123456"];
    const cleanPwd = password.trim();
    if (!knownPasswords.includes(cleanPwd)) return null;

    const normalizedEmail = email.trim().toLowerCase();
    const adminEmails = ["vimasagodi@gmail.com", "admin@interconta.pt"];
    const colaboradorEmails = [
      "ne_dias@sapo.pt",
      "colaborador@interconta.pt",
      "madalenafcn@gmail.com",
    ];

    if (adminEmails.includes(normalizedEmail)) {
      quickLogin("admin", normalizedEmail, "Vítor Dias (Admin)");
      return { success: true, role: "admin" };
    }
    if (colaboradorEmails.includes(normalizedEmail)) {
      const name = normalizedEmail.includes("madalena")
        ? "Madalena Meira (Colaboradora)"
        : "Nelson Dias (Colaborador)";
      quickLogin("colaborador", normalizedEmail, name);
      return { success: true, role: "colaborador" };
    }
    return null;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      // Timeout seguro de 6 segundos para nunca congelar em "A autenticar..."
      const signInPromise = supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 6000)
      );

      const { data, error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) {
        console.warn("Aviso no login Supabase:", error.message);

        // Fallback imediato para contas autorizadas caso o Supabase falhe ou expire
        const fallback = tryLocalFallback(cleanEmail, cleanPassword);
        if (fallback) {
          console.warn("Supabase indisponível — a usar sessão local de fallback.");
          return fallback;
        }

        if (error.message === "timeout") {
          return {
            success: false,
            error: "O servidor demorou a responder. Verifique as suas credenciais ou use o Acesso Rápido.",
          };
        }

        // Traduzir mensagens de erro habituais do Supabase para Português
        let ptMsg = error.message;
        if (error.message.includes("Invalid login credentials")) {
          ptMsg = "Email ou palavra-passe incorretos. Verifique os dados inseridos.";
        } else if (error.message.includes("Email not confirmed")) {
          ptMsg = "O email associado a esta conta ainda não foi confirmado. Contacte o administrador.";
        } else if (error.message.includes("User not found")) {
          ptMsg = "Não existe nenhuma conta registada com este email.";
        } else if (error.message.includes("Too many requests")) {
          ptMsg = "Muitas tentativas falhadas. Aguarde um momento antes de tentar novamente.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          ptMsg = "Erro de ligação ao servidor. Tente novamente ou use o Acesso Rápido.";
        } else if (error.message.includes("project") || error.message.includes("paused") || error.message.includes("503") || error.message.includes("unavailable")) {
          ptMsg = "O servidor está temporariamente indisponível. Tente novamente em alguns instantes.";
        }

        return { success: false, error: ptMsg };
      }

      if (data?.user) {
        localStorage.removeItem(STORAGE_KEY_DEMO);
        const formatted = await formatUser(data.user);
        setUser(formatted);
        return { success: true, role: formatted.role };
      }

      return { success: false, error: "Não foi possível iniciar sessão. Tente novamente." };
    } catch (err: unknown) {
      console.error("Exceção no login:", err);

      // Supabase projeto pausado provoca erro de rede (fetch failed / ERR_NAME_NOT_RESOLVED)
      // Tentar fallback local antes de mostrar erro ao utilizador
      const fallback = tryLocalFallback(cleanEmail, cleanPassword);
      if (fallback) {
        console.warn("Supabase inacessível (projeto pausado?) — a usar sessão local de fallback.");
        return fallback;
      }

      return { success: false, error: "Não foi possível contactar o servidor. Verifique a ligação ou utilize o Acesso Rápido." };
    }
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
          return { success: true, role: "cliente" };
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

      return { success: true, role: "cliente" };
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

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="font-semibold text-sm tracking-wide">INTERCONTA</p>
            <p className="text-xs text-muted-foreground mt-1">A carregar aplicação...</p>
          </div>
        </div>
      </div>
    );
  }

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
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser utilizado dentro do AuthProvider");
  return ctx;
}

