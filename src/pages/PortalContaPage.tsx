import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  type BillingMovement,
  getRecurringAvencaMovements,
  fetchClients,
} from "@/lib/clientes";

const PortalContaPage = () => {
  const [clients, setClients] = useState<any[]>([]);
  useEffect(() => { fetchClients().then(setClients); }, []);

  const selectedClient = useMemo(
    () => clients.find((client) => client.status === "ativo") ?? clients[0],
    [clients],
  );

  const avencaMovements = useMemo(
    () =>
      selectedClient
        ? getRecurringAvencaMovements([selectedClient], 6)
        : [],
    [selectedClient],
  );

  const manualMovements = useMemo<BillingMovement[]>(() => {
    if (!selectedClient || !selectedClient.valorAvenca) return [];

    return [
      {
        id: `pag-${selectedClient.id}-1`,
        date: "2026-01-15",
        type: "pagamento",
        description: "Pagamento Janeiro",
        value: -selectedClient.valorAvenca,
        client: selectedClient.name,
      },
      {
        id: `pag-${selectedClient.id}-2`,
        date: "2026-02-15",
        type: "pagamento",
        description: "Pagamento Fevereiro",
        value: -selectedClient.valorAvenca,
        client: selectedClient.name,
      },
      {
        id: `extra-${selectedClient.id}-1`,
        date: "2026-03-10",
        type: "fatura",
        description: "Serviço extra IRS",
        value: 300,
        client: selectedClient.name,
      },
    ];
  }, [selectedClient]);

  const movementsWithBalance = useMemo(() => {
    const orderedMovements = [...avencaMovements, ...manualMovements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let runningBalance = 0;

    return orderedMovements.map((movement) => {
      runningBalance += movement.value;
      return {
        ...movement,
        balance: runningBalance,
      };
    });
  }, [avencaMovements, manualMovements]);

  const saldoAtual = movementsWithBalance[movementsWithBalance.length - 1]?.balance ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Conta Corrente</h1>
        <p className="text-muted-foreground mt-1">
          {selectedClient
            ? `Movimentos de ${selectedClient.name} com avenças lançadas no fim de cada mês`
            : "Histórico completo de movimentos"}
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
            €{Math.abs(saldoAtual).toLocaleString()}
            {saldoAtual > 0 ? " em dívida" : saldoAtual < 0 ? " a favor" : ""}
          </span>
        </div>
      </div>

      <div className="elevated-card rounded-xl overflow-hidden">
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
                    movement.value > 0 ? "text-info" : "text-success",
                  )}
                >
                  {movement.value > 0 ? "+" : ""}€{Math.abs(movement.value).toLocaleString()}
                </td>
                <td
                  className={cn(
                    "px-5 py-3 text-sm font-medium text-right",
                    movement.balance > 0 ? "text-destructive" : "text-success",
                  )}
                >
                  €{Math.abs(movement.balance).toLocaleString()}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PortalContaPage;
