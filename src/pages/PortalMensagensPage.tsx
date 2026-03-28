import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isClosingIntent } from "@/lib/identification";

interface Message {
  id: string;
  text: string;
  sender: "cliente" | "gabinete";
  sender_name?: string;
  created_at: string;
}

const PortalMensagensPage = () => {
  const { user, impersonatedClient } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Determinar o ID do cliente (seja login direto ou impersonação)
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const getClientId = async () => {
      if (impersonatedClient) {
        setClientId(impersonatedClient.id);
        return;
      }
      if (user?.role === "cliente") {
        // Tenta por user_id primeiro
        const { data: byUserId } = await supabase
          .from("clientes")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (byUserId) {
          setClientId(byUserId.id);
        } else {
          // Fallback por email
          const { data: byEmail } = await supabase
            .from("clientes")
            .select("id")
            .eq("email", user.email)
            .maybeSingle();
          if (byEmail) setClientId(byEmail.id);
        }
      }
    };
    getClientId();
  }, [user, impersonatedClient]);

  useEffect(() => {
    if (!clientId) return;
    const fetchMessages = async () => {
      setLoading(true);
      // Filtrar apenas as últimas 48 horas
      const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data } = await supabase
        .from("mensagens")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", threshold)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
      setLoading(false);
    };
    fetchMessages();

    // Realtime subscription (Optional for now, but good)
    const channel = supabase
      .channel("mensagens_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `client_id=eq.${clientId}` }, 
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const send = async () => {
    if (!newMsg.trim() || !clientId || sending) return;
    setSending(true);
    try {
      const isClient = user?.role === "cliente";
      
      // 1. Salvar mensagem
      const { data: newMsgData, error: msgErr } = await supabase.from("mensagens").insert({
        client_id: clientId,
        text: newMsg,
        sender: isClient ? "cliente" : "gabinete",
        sender_name: isClient ? undefined : user?.name
      }).select().single();

      if (msgErr) throw msgErr;

      // Update local state immediately for better UX
      if (newMsgData) {
        setMessages(prev => [...prev, newMsgData as Message]);
      }

      // 2. Lógica de Tarefas se for o cliente a enviar
      if (user?.role === "cliente") {
        const isClosing = isClosingIntent(newMsg);

        if (isClosing) {
          // Se for uma intenção de fechar, atualizamos as tarefas pendentes deste cliente
          const { error: updateErr } = await supabase
            .from("tarefas")
            .update({ status: "concluida" })
            .eq("client_id", clientId)
            .eq("status", "por_fazer")
            .ilike("title", "Mensagem de Cliente%");
          
          if (updateErr) console.error("Error auto-resolving tasks:", updateErr);
          else toast.success("Tarefa marcada como resolvida automaticamente");
        } else {
          // Caso contrário, criamos uma nova tarefa se não houver uma aberta nas últimas 2 horas
          // (Evitar spam de tarefas para a mesma conversa imediata)
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: existingTask } = await supabase
            .from("tarefas")
            .select("id")
            .eq("client_id", clientId)
            .eq("status", "por_fazer")
            .ilike("title", "Mensagem de Cliente%")
            .gte("created_at", twoHoursAgo)
            .maybeSingle();

          if (!existingTask) {
            const { data: clientRecord } = await supabase
              .from("clientes")
              .select("name")
              .eq("id", clientId)
              .single();

            const clientName = clientRecord?.name || user?.name || "Cliente";
            
            const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
              ? crypto.randomUUID() 
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                  const r = Math.random() * 16 | 0;
                  const v = c === 'x' ? r : (r & 0x3 | 0x8);
                  return v.toString(16);
                });

            const { error: taskErr } = await supabase.from("tarefas").insert({
              id: generatedId,
              title: `Mensagem de Cliente: ${clientName}`,
              description: newMsg,
              client: clientName,
              client_id: clientId,
              status: "por_fazer",
              priority: "alta",
              due_date: new Date().toISOString().split("T")[0],
              recurrence: "pontual",
              responsible: "Sistema"
            });

            if (taskErr) console.error("Error creating task:", taskErr);
          }
        }
      }

      setNewMsg("");
    } catch (error: any) {
      toast.error("Erro ao enviar mensagem");
      console.error(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[900px] h-[calc(100vh-2rem)] flex flex-col">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Mensagens</h1>
        <p className="text-muted-foreground mt-1">Comunicação com o gabinete</p>
      </motion.div>

      <div className="flex-1 elevated-card rounded-xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center p-10 text-muted-foreground">
              Sem mensagens. Inicie a conversa abaixo.
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.sender === "cliente" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[70%] rounded-xl px-4 py-3 ${m.sender === "cliente" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <p className="text-sm">{m.text}</p>
                      <div className={`flex items-center gap-2 mt-1 text-[10px] ${m.sender === "cliente" ? "text-primary-foreground/60 justify-end" : "text-muted-foreground justify-start"}`}>
                        {m.sender === "gabinete" && m.sender_name && (
                          <span className="font-semibold">{m.sender_name} • </span>
                        )}
                        <span>
                          {new Date(m.created_at).toLocaleString("pt-PT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          <Input
            placeholder="Escreva a sua mensagem..."
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={sending}
          />
          <Button onClick={send} size="icon" disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PortalMensagensPage;
