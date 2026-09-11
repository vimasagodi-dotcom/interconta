import React, { useState } from "react";
import {
  MessageCircle,
  Smartphone,
  Send,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  Bot,
  FileSpreadsheet,
  Users,
  Calendar,
  HelpCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    sender: "bot",
    text: "👋 *Olá! Bem-vindo ao Controlo Remoto Interconta por WhatsApp.*\n\nPode comandar a extração de faturas da AT, consultar totais e gerir clientes diretamente do seu telemóvel.\n\nExperimente tocar num dos atalhos abaixo ou escreva um comando!",
    time: "Agora",
  },
];

const WhatsAppPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [authorizedPhone, setAuthorizedPhone] = useState(() => {
    return localStorage.getItem("interconta_wa_phone") || "+351 910 000 000";
  });

  const webhookUrl = "https://interconta.vercel.app/api/whatsapp";
  const verifyToken = "interconta_token_2026";

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copiado para a área de transferência!`);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("interconta_wa_phone", authorizedPhone);
    toast.success("Número de telemóvel autorizado gravado com sucesso!");
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text,
      time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          phone: authorizedPhone,
          simulate: true,
        }),
      });

      const data = await res.json();
      const replyText = data.reply || "Mensagem recebida, mas sem resposta definida.";

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: replyText,
        time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: `⚠️ Erro ao comunicar com o assistente: ${err?.message || "Falha de rede"}`,
        time: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5 bg-card p-6 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/20 shrink-0">
            <MessageCircle className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-foreground">Painel de Controlo WhatsApp</h1>
              <Badge className="bg-emerald-600 text-white font-medium hover:bg-emerald-600 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
                Bot Ativo
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Controle o Interconta, extraia faturas da AT e consulte dados do gabinete a partir do seu telemóvel.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-muted/40 text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Acesso Seguro por Número Autorizado</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: WhatsApp Simulator Phone Mockup (5 cols) */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-md bg-slate-900 border-4 border-slate-700 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[650px] relative">
            {/* Phone Top Notch Bar */}
            <div className="bg-slate-950 px-6 py-3 flex items-center justify-between text-[11px] text-slate-300 select-none">
              <span className="font-semibold">09:41</span>
              <div className="w-20 h-4 bg-black rounded-full" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">5G</span>
                <div className="w-4 h-2 border border-slate-300 rounded-sm" />
              </div>
            </div>

            {/* WhatsApp App Header */}
            <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">Interconta AI Assistente</h3>
                  <span className="text-[11px] text-emerald-200 block">online • Controlo Remoto</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-emerald-100 border-emerald-600 bg-emerald-900/40">
                Oficial
              </Badge>
            </div>

            {/* Chat Area with WhatsApp Background Texture Pattern */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0b141a] text-xs">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm text-slate-100 whitespace-pre-wrap leading-relaxed ${
                      m.sender === "user"
                        ? "bg-[#005c4b] rounded-tr-none text-white"
                        : "bg-[#202c33] rounded-tl-none border border-slate-700/50"
                    }`}
                  >
                    {m.text}
                    <div
                      className={`text-[9px] mt-1 text-right select-none ${
                        m.sender === "user" ? "text-emerald-200/70" : "text-slate-400"
                      }`}
                    >
                      {m.time} {m.sender === "user" && "✓✓"}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 bg-[#202c33] text-slate-300 px-3 py-2 rounded-2xl rounded-tl-none w-fit text-[11px]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>A consultar a Autoridade Tributária...</span>
                </div>
              )}
            </div>

            {/* Quick Chips Prompts Bar */}
            <div className="bg-[#111b21] p-2 overflow-x-auto flex items-center gap-1.5 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sendMessage("resumo 518112098")}
                className="h-6 text-[10px] px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 shrink-0"
              >
                📊 Resumo 518112098
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sendMessage("faturas 518112098 vendas 2026-01")}
                className="h-6 text-[10px] px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 shrink-0"
              >
                📥 Faturas Jan
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sendMessage("clientes")}
                className="h-6 text-[10px] px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 shrink-0"
              >
                👥 Clientes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sendMessage("prazos")}
                className="h-6 text-[10px] px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 shrink-0"
              >
                📅 Prazos
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sendMessage("ajuda")}
                className="h-6 text-[10px] px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 shrink-0"
              >
                ❓ Ajuda
              </Button>
            </div>

            {/* Phone Message Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="bg-[#202c33] p-2.5 flex items-center gap-2"
            >
              <Input
                placeholder="Escreva um comando ou mensagem..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isLoading}
                className="h-9 text-xs bg-[#2a3942] border-none text-white placeholder:text-slate-400 focus-visible:ring-emerald-500 rounded-full pl-3.5"
              />
              <Button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                size="sm"
                className="h-9 w-9 p-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
          <span className="text-xs text-muted-foreground mt-3 text-center">
            📱 Simulador em tempo real ligado diretamente ao endpoint <code>/api/whatsapp</code>
          </span>
        </div>

        {/* Right Column: Settings & Documentation (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card: Authorized Phone Number */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                1
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Número de Telemóvel Autorizado</h2>
                <p className="text-xs text-muted-foreground">
                  Apenas o seu número de WhatsApp poderá enviar ordens ao assistente
                </p>
              </div>
            </div>

            <form onSubmit={handleSavePhone} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  O Seu Número de WhatsApp (com indicativo internacional)
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="+351 912 345 678"
                    value={authorizedPhone}
                    onChange={(e) => setAuthorizedPhone(e.target.value)}
                    className="h-10 font-mono text-xs"
                    required
                  />
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4">
                    Gravar Número
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                🔒 Por razões de segurança e sigilo profissional, mensagens vindas de números desconhecidos não têm acesso aos dados fiscais.
              </p>
            </form>
          </div>

          {/* Card: Webhook Connection Details */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
                2
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Dados de Ligação Webhook (WhatsApp API)</h2>
                <p className="text-xs text-muted-foreground">
                  Compatível com Meta Cloud API, Twilio, Evolution API ou Z-API
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <span className="font-semibold text-foreground">URL de Callback (Webhook):</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/60 border font-mono text-[11px] text-muted-foreground break-all">
                  <span>{webhookUrl}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 shrink-0 ml-2"
                    onClick={() => handleCopy(webhookUrl, "URL de Callback")}
                  >
                    {copiedField === "URL de Callback" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-foreground">Verify Token (Para Meta WhatsApp):</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/60 border font-mono text-[11px] text-muted-foreground">
                  <span>{verifyToken}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 shrink-0 ml-2"
                    onClick={() => handleCopy(verifyToken, "Verify Token")}
                  >
                    {copiedField === "Verify Token" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Command Cheat-sheet */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
                3
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Guia de Comandos do WhatsApp</h2>
                <p className="text-xs text-muted-foreground">
                  O que pode escrever a qualquer hora a partir do telemóvel
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-1">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Totais Certificados AT</span>
                </div>
                <code className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-mono">
                  resumo 518112098
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Devolve a tabela mês a mês com todas as faturas entregues e IVA total.
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-1">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span>Extrair Faturas da AT</span>
                </div>
                <code className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-mono">
                  faturas 518112098 vendas 2026-01
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Dispara a extração completa e envia o resumo e link de download.
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-1">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Lista de Empresas</span>
                </div>
                <code className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-mono">
                  clientes
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Mostra os NIFs e nomes das empresas registadas no gabinete.
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-1">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Prazos e Obrigações</span>
                </div>
                <code className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-mono">
                  prazos
                </code>
                <p className="text-[11px] text-muted-foreground">
                  Lista os prazos fiscais de IVA, IRS e entrega de faturas do mês.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppPage;
