import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const success = await login(email, password);
    if (!success) setError("Credenciais inválidas. Tente novamente.");
    setLoading(false);
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
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
              <Building2 className="w-6 h-6 text-accent-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">ContaGest</h1>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">Bem-vindo de volta</h2>
          <p className="text-muted-foreground mb-8">Introduza as suas credenciais para aceder</p>

          <form onSubmit={handleSubmit} className="space-y-5">
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
              <Label htmlFor="password">Password</Label>
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

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive bg-destructive/10 rounded-md p-3"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "A entrar..." : "Entrar"}
            </Button>
          </form>


        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
