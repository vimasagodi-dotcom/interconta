import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Receipt, Wallet, FileText, MessageSquare, Building2, User, Phone, Mail, Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { type Client, fetchMovements, type BillingMovement } from "@/lib/clientes";

const PortalPage = () => {
  const { user, impersonatedClient, impersonate } = useAuth();
  const [clientData, setClientData] = useState<Client | null>(null);
  const [movements, setMovements] = useState<BillingMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // Prioridade: cliente impersonado (admin a ver canal do cliente)
      if (impersonatedClient) {
        setClientData(impersonatedClient);
        if (impersonatedClient.access_faturacao !== false) {
          const mvts = await fetchMovements(impersonatedClient.id);
          setMovements(mvts.slice(0, 5));
        }
        setLoading(false);
        return;
      }

      if (!user?.id) return;

      // 1. Buscar dados do cliente vinculado a este utilizador
      const { data: client, error: clientErr } = await supabase
        .from('clientes')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (client && !clientErr) {
        setClientData(client as Client);
        
        // 2. Buscar movimentos se tiver acesso à faturação
        if (client.access_faturacao !== false) {
          const mvts = await fetchMovements(client.id);
          setMovements(mvts.slice(0, 5)); // Apenas os 5 mais recentes
        }
      }
      setLoading(false);
    };

    loadData();
  }, [user, impersonatedClient]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Perfil não vinculado</h2>
        <p className="text-muted-foreground max-w-md mt-2">
          A sua conta de utilizador ainda não está vinculada a uma ficha de cliente. 
          Contacte o gabinete para ativar o seu acesso.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Bem-vindo, {clientData.name}</h1>
        <p className="text-muted-foreground mt-1">Área reservada da sua empresa</p>
      </motion.div>

      {/* Info Card */}
      <div className="elevated-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{clientData.name}</h2>
            <div className="flex flex-wrap gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">NIF: {clientData.nif}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">Cliente Nº: {clientData.numeroCliente}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4 text-primary" />
            <span>Gestor: Ana Santos</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-4 h-4 text-primary" />
            <span>211 234 567</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-4 h-4 text-primary" />
            <span>info@gabinete.pt</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {clientData.access_faturacao !== false ? (
          <StatCard 
            title="Saldo Atual" 
            value={`€${(clientData.saldo || 0).toLocaleString()}`} 
            change="Em aberto" 
            changeType="negative" 
            icon={<Wallet className="w-5 h-5" />} 
          />
        ) : (
          <div className="elevated-card rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-60">
            <Lock className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Faturação Indisponível</p>
          </div>
        )}

        {clientData.access_documentos !== false ? (
          <StatCard title="Documentos" value={0} change="Aguardando upload" changeType="neutral" icon={<FileText className="w-5 h-5" />} />
        ) : (
          <div className="elevated-card rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-60">
            <Lock className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-xs font-medium text-muted-foreground">Documentos Indisponíveis</p>
          </div>
        )}

        <StatCard title="Mensagens" value={0} change="Nenhuma nova" changeType="neutral" icon={<MessageSquare className="w-5 h-5" />} />
      </div>

      {/* Movements Table */}
      {clientData.access_faturacao !== false && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="elevated-card rounded-xl overflow-hidden"
        >
          <div className="p-5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Últimos Movimentos</h3>
          </div>
          <div className="space-y-0">
            {movements.length > 0 ? (
              movements.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between p-5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20">{new Date(m.date).toLocaleDateString()}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.description}</p>
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{m.type}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${m.value < 0 ? "text-green-600" : "text-primary"}`}>
                    {m.value < 0 ? "" : "+"}€{Math.abs(m.value).toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-10 text-center">
                <p className="text-sm text-muted-foreground">Não existem movimentos recentes.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default PortalPage;
