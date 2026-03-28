import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Download, File, Image as ImageIcon, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const fileIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("pdf")) return <FileText className="w-5 h-5 text-destructive" />;
  if (t.includes("xls") || t.includes("csv")) return <FileSpreadsheet className="w-5 h-5 text-success" />;
  if (t.includes("png") || t.includes("jpg") || t.includes("jpeg")) return <ImageIcon className="w-5 h-5 text-info" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
};

const PortalDocumentosPage = () => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('documentos').select('*').order('created_at', { ascending: false }).then(({data}) => {
      if (data) setDocs(data);
      setLoading(false);
    });
  }, []);

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
                <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('pt-PT')} · {doc.size}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>
            </Button>
          </motion.div>
        ))}
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground pt-4">Ainda não existem documentos publicados.</p>
        )}
      </div>
      )}
    </div>
  );
};

export default PortalDocumentosPage;
