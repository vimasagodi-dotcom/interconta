import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, X, Minimize2, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  time: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    content: "Olá! 👋 Sou o assistente do ContaGest. Posso ajudar com tarefas, clientes, faturação e muito mais. O que precisa?",
    time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
  },
];

const BOT_RESPONSES: Record<string, string> = {
  tarefas: "📋 Tem atualmente **43 tarefas pendentes**, das quais **12 estão em atraso**. As mais urgentes são:\n\n1. Declaração IRS - Auto Rápido ENI (atrasada)\n2. Enviar balancete - Padaria Flor Lda (atrasada)\n3. Enviar declaração IVA - TechNova Lda (prazo: 15/03)",
  clientes: "👥 O gabinete tem **87 clientes ativos** e **1 suspenso**. Os 3 clientes com maior saldo em dívida são:\n\n1. Auto Rápido ENI - €2.800\n2. TechNova Lda - €1.200\n3. Digital Plus SA - €350",
  saldo: "💰 **Resumo de faturação de Março:**\n\n- Faturado: €16.800\n- Recebido: €14.200\n- Taxa de cobrança: 84%\n- Pendente: €2.600",
  resumo: "📊 **Resumo do dia:**\n\n- ✅ 3 tarefas concluídas\n- ⏳ 5 tarefas em curso\n- ⚠️ 12 tarefas em atraso\n- 💶 €1.200 recebidos hoje\n- 📄 2 documentos enviados",
};

function getResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("tarefa")) return BOT_RESPONSES.tarefas;
  if (lower.includes("cliente")) return BOT_RESPONSES.clientes;
  if (lower.includes("saldo") || lower.includes("fatura")) return BOT_RESPONSES.saldo;
  if (lower.includes("resumo") || lower.includes("hoje")) return BOT_RESPONSES.resumo;
  return "Entendi o seu pedido. Num sistema completo, eu processaria esta informação com IA. Por agora, experimente perguntar sobre **tarefas**, **clientes**, **saldo** ou pedir um **resumo** do dia! 🤖";
}

const ChatAssistant = () => {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: messages.length + 1,
      role: "user",
      content: input,
      time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      const response: ChatMessage = {
        id: messages.length + 2,
        role: "assistant",
        content: getResponse(userMsg.content),
        time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, response]);
      setTyping(false);
    }, 1000);
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full gradient-accent flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
          >
            <Bot className="w-6 h-6 text-accent-foreground" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full animate-pulse-dot" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "fixed z-50 flex flex-col elevated-card rounded-2xl overflow-hidden",
              maximized ? "inset-4" : "bottom-6 right-6 w-[380px] h-[520px]"
            )}
          >
            {/* Header */}
            <div className="gradient-primary p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center">
                  <Bot className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-primary-foreground">Assistente ContaGest</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-success rounded-full" />
                    <span className="text-[10px] text-primary-foreground/60">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMaximized(!maximized)} className="p-1.5 rounded-lg text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                  {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={cn("max-w-[80%] rounded-xl px-3.5 py-2.5", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    <p className={cn("text-[10px] mt-1", m.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground")}>{m.time}</p>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse-dot" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse-dot" style={{ animationDelay: "300ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-pulse-dot" style={{ animationDelay: "600ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick actions */}
            <div className="px-4 py-2 border-t border-border flex gap-2 overflow-x-auto bg-background">
              {["Resumo do dia", "Tarefas pendentes", "Saldo clientes"].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap flex-shrink-0"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border flex gap-2 bg-background">
              <Input
                placeholder="Escreva a sua mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                className="text-sm"
              />
              <Button onClick={send} size="icon" className="flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatAssistant;
