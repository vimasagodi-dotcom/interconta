import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Download, File, Image as ImageIcon, FileSpreadsheet, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { type Client } from "@/lib/clientes";

const fileIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("pdf")) return <FileText className="w-5 h-5 text-destructive" />;
  if (t.includes("xls") || t.includes("csv")) return <FileSpreadsheet className="w-5 h-5 text-success" />;
  if (t.includes("png") || t.includes("jpg") || t.includes("jpeg")) return <ImageIcon className="w-5 h-5 text-info" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
};

interface PortalDocument {
  id: string;
  name: string;
  client?: string;
  type?: string;
  size?: string;
  file_url?: string;
  created_at?: string;
}

const PortalDocumentosPage = () => {
  const { user, impersonatedClient } = useAuth();
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true);

      let targetClientName: string | null = null;

      if (impersonatedClient) {
        if (impersonatedClient.access_documentos === false) {
          setHasAccess(false);
          setLoading(false);
          return;
        }
        targetClientName = impersonatedClient.name;
      } else if (user?.id) {
        const { data: client } = await supabase
          .from("clientes")
          .select("name, access_documentos")
          .eq("user_id", user.id)
          .maybeSingle();

        if (client) {
          if (client.access_documentos === false) {
            setHasAccess(false);
            setLoading(false);
            return;
          }
          targetClientName = client.name;
        } else if (user.email) {
          const { data: clientByEmail } = await supabase
            .from("clientes")
            .select("name, access_documentos")
            .eq("email", user.email)
            .maybeSingle();

          if (clientByEmail) {
            if (clientByEmail.access_documentos === false) {
              setHasAccess(false);
              setLoading(false);
              return;
            }
            targetClientName = clientByEmail.name;
          }
        }
      }

      if (!targetClientName) {
        setDocs([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("client", targetClientName)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setDocs(data as PortalDocument[]);
      }
      setLoading(false);
    };

    loadDocuments();
  }, [user, impersonatedClient]);

  if (!hasAccess) {
    return (
      <div className="p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Acesso a Documentos Restrito</h2>
        <p className="text-muted-foreground max-w-md mt-2">
          O acesso aos documentos está temporariamente indisponível para a sua conta. Contacte o gabinete para mais informações.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Documentos</h1>
        <p className="text-muted-foreground mt-1">Ficheiros sincronizados da plataforma do gabinete</p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
      <div className="space-y-3">
        {docs.map((doc, i) => (
          <motion.div key={doc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="elevated-card rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fileIcon(doc.type || "")}
              <div>
                <p className="text-sm font-medium text-foreground">{doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString("pt-PT") : ""}
                  {doc.size ? ` · ${doc.size}` : ""}
                </p>
              </div>
            </div>
            {doc.file_url ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download>
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            ) : null}
          </motion.div>
        ))}
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground pt-4">Ainda não existem documentos publicados para a sua empresa.</p>
        )}
      </div>
      )}
    </div>
  );
};

export default PortalDocumentosPage;
