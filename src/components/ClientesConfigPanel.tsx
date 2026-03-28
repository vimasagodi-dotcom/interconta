import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { type Client } from "@/lib/clientes";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldCheck, Key, Copy, Info } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const ClientesConfigPanel = () => {
  const [clientes, setClientes] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const loadClientes = async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("status", "ativo")
        .order("name");
      
      if (!error && data) {
        setClientes(data as Client[]);
      }
      setLoading(false);
    };
    loadClientes();
  }, []);

  const togglePermission = async (clienteId: string, field: "access_faturacao" | "access_documentos", currentValue: boolean) => {
    setUpdating(`${clienteId}-${field}`);
    const newValue = !currentValue;

    const { error } = await supabase
      .from("clientes")
      .update({ [field]: newValue })
      .eq("id", clienteId);

    if (error) {
      toast.error("Erro ao atualizar permissão: " + error.message);
    } else {
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, [field]: newValue } : c));
      toast.success("Permissão atualizada");
    }
    setUpdating(null);
  };

  const copySqlToClipboard = () => {
    const sql = `-- COPIE E EXECUTE NO SQL EDITOR DO SUPABASE PARA GERAR ACESSOS
-- Este script cria utilizadores para todos os clientes ativos que ainda não têm acesso.
-- A senha padrão será 'Interconta' + Numero do Cliente (Ex: Interconta0003)

DO $$ 
DECLARE 
    temp_row RECORD;
    new_user_id UUID;
    v_password TEXT;
BEGIN
    FOR temp_row IN SELECT id, email, "numeroCliente" FROM clientes WHERE status = 'ativo' AND email IS NOT NULL LOOP
        
        -- Definir password: Interconta + NumeroCliente (ou '1234' se vazio)
        v_password := 'Interconta' || COALESCE(temp_row."numeroCliente", '1234');

        -- Tentar criar o utilizador no auth.users (apenas se o email não existir)
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = temp_row.email) THEN
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, 
                email_confirmed_at, recovery_sent_at, last_sign_in_at, 
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
                confirmation_token, email_change, email_change_token_new, recovery_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', temp_row.email, 
                crypt(v_password, gen_salt('bf')),
                now(), now(), now(), 
                '{"provider":"email","providers":["email"]}', 
                jsonb_build_object('name', (SELECT name FROM clientes WHERE id = temp_row.id), 'role', 'cliente'), 
                now(), now(), '', '', '', ''
            ) RETURNING id INTO new_user_id;

            -- Vincular o novo utilizador ao cliente na nossa lógica
            UPDATE clientes SET user_id = new_user_id WHERE id = temp_row.id;
        END IF;

    END LOOP;
END $$;`;
    navigator.clipboard.writeText(sql);
    toast.success("Script SQL copiado para a área de transferência!");
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Configurações de Acessos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controle o que cada cliente pode visualizar no Portal Interconta.
          </p>
        </div>
        <Button onClick={copySqlToClipboard} variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
          <Key className="w-4 h-4" />
          Gerar Acessos (SQL)
        </Button>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-primary/80">
          <p className="font-semibold">Como funciona o acesso?</p>
          <p>O utilizador do cliente será o seu <strong>email</strong>. A password inicial será <strong>Interconta</strong> seguido do seu número de cliente (ex: Interconta0001).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientes.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="elevated-card rounded-xl p-5 border border-border/50"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="max-w-[150px]">
                <h3 className="text-sm font-semibold text-foreground truncate">{c.name}</h3>
                <p className="text-[11px] text-muted-foreground truncate">{c.email || "Sem email"}</p>
                <p className="text-[10px] font-mono text-primary/70 mt-1">Nº: {c.numeroCliente || "---"}</p>
              </div>
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.user_id ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {c.user_id ? 'COM ACESSO' : 'PENDENTE'}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Conta Corrente</span>
                <Switch 
                  checked={c.access_faturacao !== false} 
                  onCheckedChange={() => togglePermission(c.id, "access_faturacao", c.access_faturacao !== false)}
                  disabled={updating === `${c.id}-access_faturacao`}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Documentos Fiscais</span>
                <Switch 
                  checked={c.access_documentos !== false} 
                  onCheckedChange={() => togglePermission(c.id, "access_documentos", c.access_documentos !== false)}
                  disabled={updating === `${c.id}-access_documentos`}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ClientesConfigPanel;
