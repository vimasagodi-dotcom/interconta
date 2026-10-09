import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Building2, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  UserCheck, 
  AlertCircle, 
  KeyRound, 
  User, 
  Zap,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Calculator,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, quickLogin, clientLoginByNifOrEmail, isAuthenticated, user } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientIdentifier, setClientIdentifier] = useState("");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("credentials");

  // Se já estiver autenticado (ex: restaurado da sessão), redireciona imediatamente
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === "cliente" ? "/portal" : "/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || "Credenciais inválidas. Tente novamente.");
        setLoading(false);
      } else {
        const dest = res.role === "cliente" ? "/portal" : "/dashboard";
        navigate(dest, { replace: true });
      }
    } catch (err: unknown) {
      console.error("Erro no formulário de login:", err);
      setError("Ocorreu um erro ao autenticar. Tente novamente ou use o Acesso Rápido.");
      setLoading(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await clientLoginByNifOrEmail(clientIdentifier);
      if (!res.success) {
        setError(res.error || "Cliente não encontrado.");
        setLoading(false);
      } else {
        navigate("/portal", { replace: true });
      }
    } catch (err: unknown) {
      console.error("Erro no login de cliente:", err);
      setError("Erro ao autenticar cliente.");
      setLoading(false);
    }
  };

  const handleQuickAccess = (role: "admin" | "colaborador" | "cliente") => {
    setError("");
    setLoading(true);
    setTimeout(() => {
      quickLogin(role);
      navigate(role === "cliente" ? "/portal" : "/dashboard", { replace: true });
      setLoading(false);
    }, 150);
  };



  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-info/20 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-md"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center">
              <Building2 className="w-7 h-7 text-accent-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground">INTERCONTA</h1>
          </div>
          <h2 className="text-2xl font-semibold text-primary-foreground/90 mb-4">
            Gestão Inteligente para o seu Gabinete de Contabilidade
          </h2>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            Controle clientes, tarefas e faturação numa plataforma unificada com assistente inteligente integrado.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "Clientes", value: "360°" },
              { label: "Tarefas", value: "Smart" },
              { label: "Faturação", value: "Auto" },
              { label: "IA", value: "Chat" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-primary-foreground/10 p-4 backdrop-blur-sm">
                <p className="text-accent text-xl font-bold">{item.value}</p>
                <p className="text-primary-foreground/60 text-sm">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md space-y-6"
        >
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
              <Building2 className="w-6 h-6 text-accent-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">INTERCONTA</h1>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">Bem-vindo de volta</h2>
            <p className="text-muted-foreground text-sm">Selecione o modo de acesso pretendido</p>
          </div>

          {/* Alert Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-start gap-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3.5"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Tabs defaultValue="credentials" value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(""); }}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="credentials" className="text-xs">
                <KeyRound className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                Conta
              </TabsTrigger>
              <TabsTrigger value="client" className="text-xs">
                <Building2 className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                Cliente
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: STANDARD CREDENTIALS */}
            <TabsContent value="credentials" className="space-y-4">
              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Palavra-passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      A autenticar...
                    </span>
                  ) : (
                    "Entrar com Email"
                  )}
                </Button>
              </form>


            </TabsContent>

            {/* TAB 2: CLIENT PORTAL */}
            <TabsContent value="client" className="space-y-4">
              <form onSubmit={handleClientSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientIdentifier">NIF ou Email da Empresa</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="clientIdentifier"
                      type="text"
                      placeholder="Ex: 508433797 ou empresa@cliente.pt"
                      value={clientIdentifier}
                      onChange={(e) => setClientIdentifier(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Aceda diretamente ao portal reservado do cliente com o seu NIF fiscal.
                  </p>
                </div>

                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? "A procurar cliente..." : "Aceder ao Portal do Cliente"}
                </Button>
              </form>
            </TabsContent>

          </Tabs>

          <div className="pt-6 border-t border-border text-center space-y-2">
            <p className="text-xs text-muted-foreground mb-3">Apenas de passagem? Experimente as nossas ferramentas gratuitas:</p>
            <Button 
              variant="outline" 
              className="w-full gap-2 h-10 text-xs border-primary/20 hover:bg-primary/5" 
              onClick={() => window.open('/analisador-saft/index.html', '_blank')}
            >
              <ShieldCheck className="w-4 h-4 text-primary" />
              Analisador SAF-T Gratuito
            </Button>

            <Button 
              variant="outline" 
              className="w-full gap-2 h-10 text-xs border-emerald-500/30 hover:bg-emerald-500/10 text-foreground font-medium" 
              onClick={() => navigate('/simulador')}
            >
              <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Simulador de Salário Líquido Gratuito
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;

