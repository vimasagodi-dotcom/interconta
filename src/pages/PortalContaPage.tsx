import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2, Lock } from "lucide-react";
import {
  type BillingMovement,
  type Client,
  getRecurringAvencaMovements,
  fetchMovements,
} from "@/lib/clientes";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const PortalContaPage = () => {
  const { user, impersonatedClient } = useAuth();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [dbMovements, setDbMovements] = useState<BillingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    const loadClientAccount = async () => {
      setLoading(true);

      let client: Client | null = null;

      if (impersonatedClient) {
        client = impersonatedClient;
      } else if (user?.id) {
        const { data } = await supabase
          .from("clientes")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          client = data as Client;
        } else if (user.email) {
          const { data: byEmail } = await supabase
            .from("clientes")
            .select("*")
            .eq("email", user.email)
            .maybeSingle();
          if (byEmail) client = byEmail as Client;
        }
      }

      if (!client) {
        setSelectedClient(null);
        setLoading(false);
        return;
      }

      if (client.access_faturacao === false) {
        setHasAccess(false);
        setSelectedClient(client);
        setLoading(false);
        return;
      }

      setSelectedClient(client);

      const movements = await fetchMovements(client.id);
      setDbMovements(movements);
      setLoading(false);
    };

    loadClientAccount();
  }, [user, impersonatedClient]);

  const avencaMovements = useMemo(() => {
    if (!selectedClient || !selectedClient.valorAvenca) return [];
    return getRecurringAvencaMovements([selectedClient], 6);
  }, [selectedClient]);

  const movementsWithBalance = useMemo(() => {
    const combined = [...avencaMovements, ...dbMovements];
    
    // Sort chronologically ascending to compute running balance
    const orderedMovements = combined.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningBalance = 0;

    return orderedMovements.map((movement) => {
      runningBalance += movement.value;
      return {
        ...movement,
        balance: runningBalance,
      };
    });
  }, [avencaMovements, dbMovements]);

  const saldoAtual = selectedClient?.saldo ?? (movementsWithBalance[movementsWithBalance.length - 1]?.balance ?? 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Acesso a Conta Corrente Restrito</h2>
        <p className="text-muted-foreground max-w-md mt-2">
          A consulta de conta corrente está temporariamente desativada para a sua empresa. Contacte o gabinete para obter o extrato.
        </p>
      </div>
    );
  }

  if (!selectedClient) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-bold">Conta não vinculada</h2>
        <p className="text-muted-foreground max-w-md mt-2">
          Não foi encontrada nenhuma ficha de cliente associada a este utilizador.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Conta Corrente</h1>
        <p className="text-muted-foreground mt-1">
          Movimentos de {selectedClient.name} (NIF: {selectedClient.nif})
        </p>
      </motion.div>

      <div className="elevated-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Saldo Atual</h3>
          <span
            className={cn(
              "text-xl font-bold",
              saldoAtual > 0
                ? "text-destructive"
                : saldoAtual < 0
                  ? "text-success"
                  : "text-foreground",
            )}
          >
            €{Math.abs(saldoAtual).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            {saldoAtual > 0 ? " em dívida" : saldoAtual < 0 ? " a favor" : " regularizado"}
          </span>
        </div>
      </div>

      <div className="elevated-card rounded-xl overflow-hidden">
        {movementsWithBalance.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Ainda não existem movimentos registados na sua conta corrente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Data</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Descrição</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Tipo</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Valor</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...movementsWithBalance].reverse().map((movement, index) => (
                  <motion.tr
                    key={movement.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="border-b border-border/50 hover:bg-muted/20"
                  >
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {new Date(movement.date).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-5 py-3 text-sm text-foreground">{movement.description}</td>
                    <td className="px-5 py-3 text-sm capitalize text-muted-foreground">
                      {movement.type === "avenca" ? "avença" : movement.type}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 text-sm font-medium text-right",
                        movement.value > 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {movement.value > 0 ? "+" : ""}€{Math.abs(movement.value).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 text-sm font-medium text-right",
                        movement.balance > 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      €{Math.abs(movement.balance).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalContaPage;
