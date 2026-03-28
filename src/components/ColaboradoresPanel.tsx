import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Calendar, UserPlus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import FeriasCalendarDialog, { fetchFerias, type FeriasDay } from "@/components/FeriasCalendarDialog";
import { supabase, adminAuth } from "@/lib/supabase";

export interface Colaborador {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "admin" | "colaborador";
  ferias_transitadas?: number;
}

const ColaboradoresPanel = () => {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingColab, setEditingColab] = useState<Colaborador | null>(null);
  const [feriasDialogOpen, setFeriasDialogOpen] = useState(false);
  const [feriasColabId, setFeriasColabId] = useState<string>("");
  const [feriasColabName, setFeriasColabName] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "colaborador">("colaborador");
  const [password, setPassword] = useState("");
  const [feriasTransitadas, setFeriasTransitadas] = useState(0);

  useEffect(() => {
    supabase.from('colaboradores').select('*').order('name').then(({ data, error }) => {
      if (!error && data) setColaboradores(data);
      setLoading(false);
    });
  }, []);

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setRole("colaborador"); setPassword(""); setFeriasTransitadas(0);
    setEditingColab(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (c: Colaborador) => {
    setEditingColab(c); setName(c.name); setEmail(c.email); setPhone(c.phone || ""); setRole(c.role); setPassword(""); setFeriasTransitadas(c.ferias_transitadas || 0);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }

    if (editingColab) {
      if (password) {
         const { error: passErr } = await adminAuth.updateUserById(editingColab.id, { password });
         if (passErr) toast.error("Não foi possível atualizar a password");
      }
      
      const { error } = await supabase.from('colaboradores').update({ name, email, phone, role, ferias_transitadas: feriasTransitadas }).eq('id', editingColab.id);
      if (error) { toast.error("Erro a atualizar"); return; }
      
      setColaboradores(prev => prev.map(c => c.id === editingColab.id ? { ...c, name, email, phone, role, ferias_transitadas: feriasTransitadas } : c));
      toast.success("Colaborador atualizado");
    } else {
      if (!password) { toast.error("Introduza uma password inicial!"); return; }
      
      toast.info("A provisionar login...", { id: "creating" });
      const { data: authData, error: authError } = await adminAuth.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (authError || !authData.user) {
        toast.error("Erro no Auth: " + (authError?.message || "Desconhecido"), { id: "creating" });
        return;
      }

      const newColab = { id: authData.user.id, name, email, phone, role, ferias_transitadas: feriasTransitadas };
      const { error: dbError } = await supabase.from('colaboradores').insert([newColab]);
      
      if (dbError) {
        toast.error("Erro a guardar detalhes na tabela: " + dbError.message, { id: "creating" });
      } else {
        setColaboradores(prev => [newColab, ...prev]);
        toast.success("Conta criada! Pode enviar a password ao colaborador.", { id: "creating" });
      }
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem a certeza que quer apagar definitivamente este colaborador e bloquear o acesso?")) return;
    await adminAuth.deleteUser(id);
    await supabase.from('colaboradores').delete().eq('id', id);
    setColaboradores(prev => prev.filter(c => c.id !== id));
    toast.success("Colaborador apagado e acessos revogados");
  };

  const openFerias = (c: Colaborador) => {
    setFeriasColabId(c.id);
    setFeriasColabName(c.name);
    setFeriasDialogOpen(true);
  };

  const filtered = colaboradores.filter(c =>
    (c.name?.toLowerCase() || "").includes(search.toLowerCase()) || 
    (c.email?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const [feriasDays, setFeriasDays] = useState<FeriasDay[]>([]);
  useEffect(() => {
    fetchFerias().then(setFeriasDays);
  }, []);
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
          <p className="text-muted-foreground mt-1">
             {loading ? "A sincronizar com a cloud..." : `${colaboradores.length} colaboradores na equipa`}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate} disabled={loading}>
          <Plus className="w-4 h-4" />
          Novo Colaborador
        </Button>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Pesquisar equipa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
         <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c, i) => {
          const colabFeriasDays = feriasDays.filter(f => f.colaboradorId === c.id && f.date.startsWith(String(currentYear)));
          const totalDias = colabFeriasDays.reduce((acc, d) => acc + (d.type === "full" ? 1 : 0.5), 0);
          const nextDay = colabFeriasDays
            .filter(f => f.date >= new Date().toISOString().split("T")[0])
            .sort((a, b) => a.date.localeCompare(b.date))[0];
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="elevated-card rounded-xl p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{c.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>
                </div>
                <Badge variant="outline" className={cn("text-xs capitalize", c.role === "admin" ? "border-primary/30 text-primary" : "")}>
                  {c.role}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                {c.phone && <p>📞 {c.phone}</p>}
                {(totalDias > 0 || c.ferias_transitadas) ? (
                  <p className="text-primary font-medium">🏖️ {totalDias} gozados / {22 + (c.ferias_transitadas || 0) - totalDias} restantes</p>
                ) : null}
                {nextDay && (
                  <p className="text-primary/80">
                    Próximas: {new Date(nextDay.date).toLocaleDateString("pt-PT")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => openFerias(c)}>
                  <Calendar className="w-3.5 h-3.5" />
                  Faltas/Férias
                </Button>
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-16">
          <UserPlus className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">O formulário aguarda o primeiro colaborador.</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingColab ? "Editar Colaborador" : "Registos e Acessos do Colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@gabinete.pt" disabled={!!editingColab} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="912 345 678" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select value={role} onValueChange={v => setRole(v as "admin" | "colaborador")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Férias Transitadas (Anos Anteriores)</Label>
              <Input type="number" step="0.5" value={feriasTransitadas} onChange={e => setFeriasTransitadas(Number(e.target.value))} placeholder="Ex: 5" />
            </div>
            <div className="space-y-1.5">
              <Label>{editingColab ? "Alterar Password (opcional)" : "Password de Login *"}</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingColab ? "Guardar" : "Registar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FeriasCalendarDialog
        open={feriasDialogOpen}
        onOpenChange={setFeriasDialogOpen}
        colaboradorId={feriasColabId}
        colaboradorName={feriasColabName}
        feriasTransitadas={colaboradores.find(c => c.id === feriasColabId)?.ferias_transitadas || 0}
      />
    </div>
  );
};

export default ColaboradoresPanel;
