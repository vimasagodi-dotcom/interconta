import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, ExternalLink, Bell, ArrowLeft, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { identifyClient } from "@/lib/identification";
import { Client } from "@/lib/clientes";

interface Message {
  id: string;
  text: string;
  sender: "cliente" | "gabinete";
  sender_name?: string;
  created_at: string;
}

export const MessageAssistant = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [identifiedClient, setIdentifiedClient] = useState<Client | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Apenas para admins e colaboradores
  if (!user || user.role === "cliente") return null;

  const fetchPendingMessages = async () => {
    const { data } = await supabase
      .from("tarefas")
      .select("*")
      .ilike("title", "Mensagem de Cliente%")
      .eq("status", "por_fazer")
      .order("created_at", { ascending: false });
    
    if (data) {
      setPendingTasks(data);
    }
  };

  useEffect(() => {
    fetchPendingMessages();
    const channel = supabase
      .channel("assistant_monitor")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tarefas" }, fetchPendingMessages)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tarefas" }, fetchPendingMessages)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch messages when a task is selected
  useEffect(() => {
    if (!selectedTask) {
      setMessages([]);
      return;
    }

    const loadChat = async () => {
      setLoadingMessages(true);
      setIdentifiedClient(null);

      const client = await identifyClient({
        id: selectedTask.client_id,
        name: selectedTask.client,
        messageContent: selectedTask.description
      });

      if (!client) {
        toast.error(`Não foi possível identificar o cliente: "${selectedTask.client}".`);
        setLoadingMessages(false);
        return;
      }

      setIdentifiedClient(client);

      const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("mensagens")
        .select("*")
        .eq("client_id", client.id)
        .gte("created_at", threshold)
        .order("created_at", { ascending: true });
      
      if (data) setMessages(data);
      setLoadingMessages(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };

    loadChat();

    // Sync real-time for the active chat
    const chatChannel = supabase
      .channel(`chat_${selectedTask.id}`)
      .on("postgres_changes", { 
        event: "INSERT", 
        schema: "public", 
        table: "mensagens" 
      }, (payload) => {
        const newM = payload.new as Message;
        setMessages(prev => [...prev, newM]);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
      })
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [selectedTask]);

  const handleSendReply = async () => {
    if (!newMsg.trim() || !selectedTask || sending) return;
    setSending(true);

    try {
      const normalize = (str: string) => 
        str?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim() || "";

      let clientId = selectedTask.client_id;
      
      // Fallback via conteúdo se o nome for lixo
      if (!clientId || normalize(selectedTask.client) === "cliente") {
        const { data: m } = await supabase.from("mensagens").select("client_id").eq("text", selectedTask.description).maybeSingle();
        clientId = m?.client_id;
      }

      // Fallback via nome (token based)
      if (!clientId) {
        const taskNameNorm = normalize(selectedTask.client);
        const { data: allClients } = await supabase.from("clientes").select("id, name");
        const client = allClients?.find(c => normalize(c.name).includes(taskNameNorm) || taskNameNorm.includes(normalize(c.name)));
        clientId = client?.id;
      }

      if (!clientId) throw new Error("Cliente não encontrado");

      const { error: msgErr } = await supabase.from("mensagens").insert({
        client_id: clientId,
        text: newMsg,
        sender: "gabinete",
        sender_name: user?.name || "Assistente"
      });

      if (msgErr) throw msgErr;

      await supabase.from("tarefas").update({ status: "concluida" }).eq("id", selectedTask.id);

      setNewMsg("");
      toast.success("Resposta enviada!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar resposta.");
    } finally {
      setSending(false);
    }
  };

  const closeChat = async () => {
    if (selectedTask) {
      await supabase.from("tarefas").update({ status: "concluida" }).eq("id", selectedTask.id);
      setSelectedTask(null);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-16 right-0 w-80 bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: "450px" }}
          >
            <div className="p-4 bg-primary text-primary-foreground flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-2">
                {selectedTask ? (
                  <button onClick={closeChat} className="hover:bg-primary-foreground/20 p-1 rounded transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                <span className="font-semibold text-sm truncate max-w-[180px]">
                  {selectedTask ? selectedTask.client : "Mensagens Pendentes"}
                </span>
              </div>
              <button onClick={() => { if (selectedTask) closeChat(); setIsOpen(false); }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-muted/10">
              {!selectedTask ? (
                <div className="h-full overflow-y-auto p-2 space-y-2">
                  {pendingTasks.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p className="text-sm italic">Sem mensagens por responder.</p>
                    </div>
                  ) : (
                    pendingTasks.map((task) => (
                      <div key={task.id} className="p-3 rounded-lg border border-border bg-background hover:border-primary/50 transition-all shadow-sm">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase font-bold text-primary tracking-wider">Novo Pedido</p>
                            <p className="text-sm font-semibold mt-0.5 truncate">{task.client}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-1 italic">"{task.description}"</p>
                          </div>
                          <Button size="sm" className="h-8 text-xs px-3 gap-1 flex-shrink-0" onClick={() => setSelectedTask(task)}>
                            Responder
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Client Context Bar */}
                  {identifiedClient && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="px-3 py-1.5 bg-accent/5 border-b border-border flex justify-between items-center text-[10px]"
                    >
                      <span className="text-muted-foreground">NIF: <span className="text-foreground font-mono">{identifiedClient.nif}</span></span>
                      <span className="flex items-center gap-1">
                        Saldo: 
                        <span className={`font-bold ${identifiedClient.saldo > 0 ? "text-destructive" : "text-green-600"}`}>
                          €{identifiedClient.saldo?.toLocaleString()}
                        </span>
                      </span>
                    </motion.div>
                  )}
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {loadingMessages ? (
                      <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : messages.length === 0 ? (
                      <div className="text-center p-8 text-xs text-muted-foreground italic">Inicie a conversa para ver o histórico.</div>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} className={`flex ${m.sender === "gabinete" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-lg px-3 py-2 ${m.sender === "gabinete" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted-foreground/10 text-foreground"}`}>
                            <p className="text-xs whitespace-pre-wrap">{m.text}</p>
                            <p className={`text-[8px] mt-1 ${m.sender === "gabinete" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"}`}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={scrollRef} />
                  </div>

                  <div className="p-3 bg-background border-t border-border flex gap-2 flex-shrink-0">
                    <Input placeholder="Escreva aqui..." className="h-9 text-xs" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendReply()} disabled={sending} />
                    <Button size="icon" className="h-9 w-9 flex-shrink-0" onClick={handleSendReply} disabled={sending || !newMsg.trim()}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group">
        {pendingTasks.length > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-accent text-[10px] text-accent-foreground font-bold items-center justify-center border-2 border-background">{pendingTasks.length}</span>
          </span>
        )}
        <Button onClick={() => { setIsOpen(!isOpen); if (!isOpen) setSelectedTask(null); }} size="icon" className={`h-14 w-14 rounded-full shadow-lg transition-all duration-300 ${pendingTasks.length > 0 && !isOpen ? 'animate-bounce ring-4 ring-accent/20' : ''}`}>
          {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        </Button>
      </div>
    </div>
  );
};
