import { useMemo, useState, useEffect } from "react";
import StatCard from "@/components/StatCard";
import { Receipt, Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ContaCorrenteDialog from "@/components/ContaCorrenteDialog";
import {
  type BillingMovement,
  getCurrentMonthAvencaMovements,
  getRecurringAvencaMovements,
  fetchClients,
  fetchMovements,
  triggerToconlineSync,
} from "@/lib/clientes";
import { toast } from "sonner";

const FaturacaoPage = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [dbMovements, setDbMovements] = useState<BillingMovement[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadData = async () => {
    const [c, m] = await Promise.all([fetchClients(), fetchMovements()]);
    setClients(c);
    setDbMovements(m);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    const id = toast.loading("Sincronizando com TOConline...");
    
    const result = await triggerToconlineSync();
    
    if (result.success) {
      toast.success(`Sincronização concluída! ${result.count} movimentos processados.`, { id });
      await loadData();
    } else {
      toast.error(`Erro na sincronização: ${result.error}`, { id });
    }
    setIsSyncing(false);
  };
  
  const [contaCorrenteOpen, setContaCorrenteOpen] = useState(false);
  const avencaMovements = useMemo(
    () => getCurrentMonthAvencaMovements(clients),
    [clients],
  );

  const all2026Avencas = useMemo(
    () => getRecurringAvencaMovements(clients, 12).filter(m => new Date(m.date).getFullYear() >= 2026),
    [clients]
  );

  const movements = useMemo(
    () =>
      [...all2026Avencas, ...dbMovements].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [all2026Avencas, dbMovements],
  );

  const totalFaturado = movements
    .filter((m) => m.value > 0)
    .reduce((sum, m) => sum + m.value, 0);

  const totalRecebido = Math.abs(
    movements.filter((m) => m.value < 0).reduce((sum, m) => sum + m.value, 0),
  );

  const totalAvencas = avencaMovements.reduce((sum, m) => sum + m.value, 0);
  const taxaCobranca =
    totalFaturado > 0 ? Math.round((totalRecebido / totalFaturado) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Faturação</h1>
          <p className="text-muted-foreground mt-1">
            Gestão de conta corrente e avenças mensais
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            {isSyncing ? "Sincronizando..." : "Sincronizar TOConline"}
          </Button>
          <Button onClick={() => setContaCorrenteOpen(true)} variant="default" className="shadow-lg shadow-primary/20">
            <BookOpen className="w-4 h-4 mr-2" />
            Conta Corrente
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Faturado"
          value={`€${totalFaturado.toLocaleString()}`}
          icon={<Receipt className="w-5 h-5" />}
          change="Movimentos atuais"
        />
        <StatCard
          title="Avenças Mensais"
          value={`€${totalAvencas.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5" />}
          change={`${avencaMovements.length} lançamentos automáticos`}
          changeType="positive"
        />
        <StatCard
          title="Total Recebido"
          value={`€${totalRecebido.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5" />}
          change={`${taxaCobranca}% cobrado`}
          changeType="positive"
        />
        <StatCard
          title="Saldo Pendente"
          value={`€${(totalFaturado - totalRecebido).toLocaleString()}`}
          icon={<TrendingUp className="w-5 h-5" />}
          change="A receber"
          changeType="negative"
        />
      </div>

      <div className="elevated-card rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Movimentos Recentes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Data</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Descrição</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Cliente</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement, index) => (
                <motion.tr
                  key={movement.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {new Date(movement.date).toLocaleDateString("pt-PT")}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {movement.value > 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-info" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-success" />
                      )}
                      <span
                        className={cn(
                          "text-sm capitalize",
                          movement.type === "avenca"
                            ? "font-medium text-primary"
                            : "text-foreground",
                        )}
                      >
                        {movement.type === "avenca" ? "avença" : movement.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-foreground">
                    {movement.description}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {movement.client}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3.5 text-sm font-medium text-right",
                      movement.value > 0 ? "text-info" : "text-success",
                    )}
                  >
                    {movement.value > 0 ? "+" : ""}€
                    {Math.abs(movement.value).toLocaleString()}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ContaCorrenteDialog
        open={contaCorrenteOpen}
        onOpenChange={setContaCorrenteOpen}
        clients={clients}
      />
    </div>
  );
};

export default FaturacaoPage;
