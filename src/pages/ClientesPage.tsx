import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Phone, Mail, Building, Pencil, Wallet, Loader2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ClienteFormDialog, { type ClienteFormValues } from "@/components/ClienteFormDialog";
import ContaCorrenteDialog from "@/components/ContaCorrenteDialog";
import { type Client, fetchClients, createClient, updateClient } from "@/lib/clientes";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const ClientesPage = () => {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativo" | "suspenso">("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [contaCorrenteOpen, setContaCorrenteOpen] = useState(false);
  const [contaCorrenteClientId, setContaCorrenteClientId] = useState<string | null>(null);

  useEffect(() => {
    fetchClients().then((data) => {
      setClients(data);
      setLoading(false);
    });
    supabase.from('colaboradores').select('name').order('name').then(({ data }) => {
      if (data) setTecnicos(data.map(c => c.name));
    });
  }, []);

  const filtered = clients.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.nif.includes(search) ||
      (c.numeroCliente && c.numeroCliente.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = filter === "todos" || c.status === filter;
    return matchSearch && matchFilter;
  });

  const handleCreate = async (data: ClienteFormValues) => {
    const parsedAvenca = data.valorAvenca ? Number(data.valorAvenca) : null;

    const newClientPayload: Omit<Client, "id"> = {
      numeroCliente: data.numeroCliente,
      name: data.name,
      nif: data.nif,
      email: data.email,
      phone: data.phone,
      type: data.type,
      status: data.status,
      regimeIva: data.regimeIva,
      regime_contabilidade: data.regime_contabilidade,
      morada: data.morada,
      codigoPostal: data.codigoPostal,
      localidade: data.localidade,
      valorAvenca: Number.isFinite(parsedAvenca) ? parsedAvenca : null,
      observacoes: data.observacoes,
      saldo: data.saldo ? Number(data.saldo) : 0,
      dmr: data.dmr,
      saft: data.saft,
      irc: data.irc,
      ies: data.ies,
      tsu_tipo: data.tsu_tipo,
      decl_trimestral_tsu: data.tsu_tipo === 'TI' ? data.decl_trimestral_tsu : false,
      salarios: data.salarios,
      inventario: data.inventario,
      modelo_10: data.modelo_10,
      inscrito_vies: data.inscrito_vies,
      rcbe: data.rcbe,
      validade_rcbe: data.validade_rcbe,
      codigo_certidao_permanente: data.codigo_certidao_permanente,
      validade_certidao_permanente: data.validade_certidao_permanente,
      avenca_automatica: data.avenca_automatica,
    };

    const saved = await createClient(newClientPayload);
    if (saved) {
      setClients((prev) => [saved, ...prev]);
      toast.success("Cliente criado na Cloud com sucesso!");
    } else {
      toast.error("Erro ao criar cliente na Cloud.");
    }
  };

  const handleEdit = async (data: ClienteFormValues) => {
    if (!editingClient) return;

    const { valorAvenca: avencaStr, saldo: saldoStr, ...rest } = data;
    const parsedAvenca = avencaStr ? Number(avencaStr) : null;
    const parsedSaldo = saldoStr ? Number(saldoStr) : 0;

    const updates = {
      ...rest,
      valorAvenca: Number.isFinite(parsedAvenca) ? parsedAvenca : null,
      saldo: parsedSaldo,
    };

    const updated = await updateClient(editingClient.id, updates);
    if (updated) {
      setClients((prev) =>
        prev.map((c) => (c.id === editingClient.id ? updated : c))
      );
      setEditingClient(null);
      toast.success("Cliente atualizado na Cloud com sucesso!");
    } else {
      toast.error("Erro ao atualizar cliente.");
    }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
  };

  const openContaCorrente = (e: React.MouseEvent, clientId: string) => {
    e.stopPropagation();
    setContaCorrenteClientId(clientId);
    setContaCorrenteOpen(true);
  };

  const handleQuickPortal = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    impersonate(client);
    navigate("/portal");
    toast.success(`A entrar no portal como ${client.name}`);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground mt-1">{loading ? "A carregar da Cloud..." : `${clients.length} clientes registados`}</p>
        </div>
        <Button className="gap-2" onClick={() => setFormOpen(true)} disabled={loading}>
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Button>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nº cliente, nome ou NIF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(["todos", "ativo", "suspenso"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
           <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((client, i) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="elevated-card rounded-xl p-5 hover:shadow-lg transition-shadow cursor-pointer group flex flex-col h-full"
            onClick={() => openEdit(client)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors line-clamp-2">
                    {client.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nº {client.numeroCliente} · NIF: {client.nif}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Badge
                  variant={client.status === "ativo" ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    client.status === "ativo"
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {client.status}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Aceder ao Portal"
                  onClick={(e) => handleQuickPortal(e, client)}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-accent" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Conta Corrente"
                  onClick={(e) => openContaCorrente(e, client.id)}
                >
                  <Wallet className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(client);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground mb-4">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{client.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{client.phone}</span>
              </div>
            </div>

            <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    client.saldo < 0
                      ? "text-destructive"
                      : client.saldo > 0
                        ? "text-success"
                        : "text-foreground",
                  )}
                >
                  €{Math.abs(client.saldo || 0).toLocaleString()}
                  {(client.saldo || 0) < 0 ? " em dívida" : (client.saldo || 0) > 0 ? " a favor" : ""}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Avença</p>
                <p className="text-xs font-semibold text-foreground">
                  {client.valorAvenca ? `€${client.valorAvenca.toLocaleString()}/mês` : "—"}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      <ClienteFormDialog open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} mode="create" tecnicos={tecnicos} />

      <ClienteFormDialog
        key={editingClient?.id}
        open={!!editingClient}
        onOpenChange={(open) => !open && setEditingClient(null)}
        onSubmit={handleEdit}
        defaultValues={
          editingClient
            ? {
                numeroCliente: editingClient.numeroCliente || "",
                name: editingClient.name,
                nif: editingClient.nif,
                email: editingClient.email,
                phone: editingClient.phone,
                type: editingClient.type as "ENI" | "Lda" | "SA" | "Unipessoal",
                status: editingClient.status,
                regimeIva: editingClient.regimeIva as "Mensal" | "Trimestral" | "Isento",
                regime_contabilidade: editingClient.regime_contabilidade || "",
                morada: editingClient.morada || "",
                codigoPostal: editingClient.codigoPostal || "",
                localidade: editingClient.localidade || "",
                valorAvenca: editingClient.valorAvenca ? String(editingClient.valorAvenca) : "",
                saldo: editingClient.saldo ? String(editingClient.saldo) : "",
                dmr: editingClient.dmr || false,
                saft: editingClient.saft || false,
                irc: editingClient.irc || false,
                ies: editingClient.ies || false,
                tsu_tipo: (editingClient.tsu_tipo as "Nenhuma" | "Empresa" | "TI") || "Nenhuma",
                decl_trimestral_tsu: editingClient.decl_trimestral_tsu || false,
                salarios: editingClient.salarios || false,
                inventario: editingClient.inventario || false,
                modelo_10: editingClient.modelo_10 || false,
                inscrito_vies: editingClient.inscrito_vies || false,
                rcbe: editingClient.rcbe || "",
                validade_rcbe: editingClient.validade_rcbe || "",
                codigo_certidao_permanente: editingClient.codigo_certidao_permanente || "",
                validade_certidao_permanente: editingClient.validade_certidao_permanente || "",
                observacoes: editingClient.observacoes || "",
                avenca_automatica: editingClient.avenca_automatica ?? true,
              }
            : undefined
        }
        mode="edit"
        tecnicos={tecnicos}
        client={editingClient || undefined}
      />

      <ContaCorrenteDialog
        open={contaCorrenteOpen}
        onOpenChange={setContaCorrenteOpen}
        clients={contaCorrenteClientId ? clients.filter(c => c.id === contaCorrenteClientId) : clients}
      />
    </div>
  );
};

export default ClientesPage;
