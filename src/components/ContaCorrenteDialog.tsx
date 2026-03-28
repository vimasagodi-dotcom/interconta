import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type Client,
  type BillingMovement,
  getRecurringAvencaMovements,
  fetchMovements,
  createMovement,
} from "@/lib/clientes";
import {
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// O prefixo das chaves de localStorage foi mantido para referência, mas a lógica agora é SQL no Supabase.
const MOVEMENTS_KEY = "interconta_movements";

interface ContaCorrenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
}

const ContaCorrenteDialog = ({
  open,
  onOpenChange,
  clients,
}: ContaCorrenteDialogProps) => {
  const activeClients = useMemo(
    () => clients.filter((c) => c.status === "ativo"),
    [clients]
  );

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [dbMovements, setDbMovements] = useState<BillingMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"fatura" | "pagamento">("fatura");
  const [formDesc, setFormDesc] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formDate, setFormDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );

  const loadMovementsFromDb = useCallback(async (clientId?: string) => {
    setLoading(true);
    const data = await fetchMovements(clientId);
    setDbMovements(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      loadMovementsFromDb(selectedClientId || undefined);
    }
  }, [open, selectedClientId, loadMovementsFromDb]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const avencaMovements = useMemo(
    () =>
      selectedClient
        ? getRecurringAvencaMovements([selectedClient], 12)
        : [],
    [selectedClient]
  );

  const clientManualMovements = useMemo(
    () =>
      selectedClient
        ? dbMovements.filter((m) => m.client_id === selectedClient.id || m.client === selectedClient.name)
        : [],
    [dbMovements, selectedClient]
  );

  const initialMovement = useMemo(() => {
    if (!selectedClient || !selectedClient.saldo) return [];
    return [{
      id: `saldo-inicial-${selectedClient.id}`,
      date: "2010-01-01", // Forced old date so it always appears first in the ledger
      type: "fatura" as const,
      description: "Avenças em Dívida (Transitado)",
      value: Number(selectedClient.saldo),
      client: selectedClient.name,
    }];
  }, [selectedClient]);

  const movementsWithBalance = useMemo(() => {
    const all = [...initialMovement, ...avencaMovements, ...clientManualMovements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let balance = 0;
    return all.map((m) => {
      balance += m.value;
      return { ...m, balance };
    });
  }, [avencaMovements, clientManualMovements, initialMovement]);

  const saldoAtual =
    movementsWithBalance[movementsWithBalance.length - 1]?.balance ?? 0;

  const handleAddMovement = useCallback(async () => {
    if (!selectedClient) return;
    const val = parseFloat(formValue);
    if (!val || val <= 0) {
      toast.error("Introduza um valor válido");
      return;
    }
    if (!formDesc.trim()) {
      toast.error("Introduza uma descrição");
      return;
    }

    const movementData = {
      date: formDate,
      type: formType,
      description: formDesc.trim(),
      value: formType === "pagamento" ? -val : val,
      client_id: selectedClient.id,
    };

    const success = await createMovement(movementData);
    if (success) {
      loadMovementsFromDb(selectedClient.id);
      setShowForm(false);
      setFormDesc("");
      setFormValue("");
      toast.success(
        formType === "fatura" ? "Fatura registada" : "Pagamento registado"
      );
    } else {
      toast.error("Erro ao guardar no servidor");
    }
  }, [selectedClient, formValue, formDesc, formDate, formType, loadMovementsFromDb]);

  const handleDownloadPDF = useCallback(() => {
    if (!selectedClient || movementsWithBalance.length === 0) return;

    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("INTERCONTA", 14, 20);
    doc.setFontSize(11);
    doc.text("Conta Corrente", 14, 28);

    doc.setFontSize(10);
    doc.text(`Cliente: ${selectedClient.name}`, 14, 40);
    doc.text(`NIF: ${selectedClient.nif}`, 14, 46);
    doc.text(
      `Data: ${new Date().toLocaleDateString("pt-PT")}`,
      14,
      52
    );

    const reversed = [...movementsWithBalance].reverse();

    autoTable(doc, {
      startY: 60,
      head: [["Data", "Tipo", "Descrição", "Valor", "Saldo"]],
      body: reversed.map((m) => [
        new Date(m.date).toLocaleDateString("pt-PT"),
        m.type === "avenca" ? "Avença" : m.type === "fatura" ? "Fatura" : "Pagamento",
        m.description,
        `${m.value > 0 ? "+" : ""}€${Math.abs(m.value).toLocaleString()}`,
        `€${Math.abs(m.balance).toLocaleString()}${m.balance > 0 ? " (dívida)" : m.balance < 0 ? " (favor)" : ""}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [34, 51, 82] },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 180;
    doc.setFontSize(10);
    doc.text(
      `Saldo Atual: €${Math.abs(saldoAtual).toLocaleString()}${saldoAtual > 0 ? " em dívida" : saldoAtual < 0 ? " a favor" : ""}`,
      14,
      finalY + 10
    );

    doc.save(`conta-corrente-${selectedClient.name.replace(/\s+/g, "-")}.pdf`);
    toast.success("PDF transferido com sucesso");
  }, [selectedClient, movementsWithBalance, saldoAtual]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Conta Corrente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client selector */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label className="text-muted-foreground text-xs mb-1.5 block">
                Selecionar Cliente
              </Label>
              <Select
                value={selectedClientId}
                onValueChange={setSelectedClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {activeClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowForm(!showForm);
                    setFormType("fatura");
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Novo Movimento
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPDF}
                >
                  <Download className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            )}
          </div>

          {/* Add movement form */}
          {showForm && selectedClient && (
            <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select
                    value={formType}
                    onValueChange={(v) =>
                      setFormType(v as "fatura" | "pagamento")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fatura">
                        Fatura (valor a receber)
                      </SelectItem>
                      <SelectItem value="pagamento">
                        Pagamento (valor recebido)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Descrição
                  </Label>
                  <Input
                    placeholder="Ex: Serviço de consultoria"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Valor (€)
                  </Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleAddMovement}>
                  Registar
                </Button>
              </div>
            </div>
          )}

          {/* Balance summary */}
          {selectedClient && (
            <div className="flex items-center justify-between border border-border rounded-lg p-4 bg-card">
              <span className="text-sm font-medium text-foreground">
                Saldo Atual
              </span>
              <span
                className={cn(
                  "text-lg font-bold",
                  saldoAtual > 0
                    ? "text-destructive"
                    : saldoAtual < 0
                      ? "text-success"
                      : "text-foreground"
                )}
              >
                €{Math.abs(saldoAtual).toLocaleString()}
                {saldoAtual > 0
                  ? " em dívida"
                  : saldoAtual < 0
                    ? " a favor"
                    : ""}
              </span>
            </div>
          )}

          {/* Movements table */}
          {selectedClient && movementsWithBalance.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">
                        Data
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">
                        Tipo
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">
                        Descrição
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">
                        Valor
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">
                        Saldo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...movementsWithBalance].reverse().map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">
                          {new Date(m.date).toLocaleDateString("pt-PT")}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {m.value > 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-info" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5 text-success" />
                            )}
                            <span
                              className={cn(
                                "text-sm capitalize",
                                m.type === "avenca"
                                  ? "font-medium text-primary"
                                  : "text-foreground"
                              )}
                            >
                              {m.type === "avenca"
                                ? "avença"
                                : m.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-foreground">
                          {m.description}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-sm font-medium text-right",
                            m.value > 0 ? "text-info" : "text-success"
                          )}
                        >
                          {m.value > 0 ? "+" : ""}€
                          {Math.abs(m.value).toLocaleString()}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-sm font-medium text-right",
                            m.balance > 0
                              ? "text-destructive"
                              : "text-success"
                          )}
                        >
                          €{Math.abs(m.balance).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedClient && movementsWithBalance.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Sem movimentos para este cliente.
            </p>
          )}

          {!selectedClient && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Selecione um cliente para ver a conta corrente.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContaCorrenteDialog;
