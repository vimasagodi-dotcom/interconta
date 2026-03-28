import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, FileText, Download, File, Image as ImageIcon, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { fetchClients } from "@/lib/clientes";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Document {
  id: string;
  name: string;
  client: string;
  type: string;
  size: string;
  uploaded_by: string;
  category: "fatura" | "declaracao" | "relatorio" | "outro";
  file_url: string;
  created_at: string;
}

const categoryConfig = {
  fatura: { label: "Fatura", class: "bg-accent/10 text-accent border-accent/20" },
  declaracao: { label: "Declaração", class: "bg-info/10 text-info border-info/20" },
  relatorio: { label: "Relatório", class: "bg-success/10 text-success border-success/20" },
  outro: { label: "Outro", class: "bg-muted text-muted-foreground" },
};

const fileIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("pdf")) return <FileText className="w-5 h-5 text-destructive" />;
  if (t.includes("xls") || t.includes("csv")) return <FileSpreadsheet className="w-5 h-5 text-success" />;
  if (t.includes("png") || t.includes("jpg") || t.includes("jpeg")) return <ImageIcon className="w-5 h-5 text-info" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const DocumentosPage = () => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [clients, setClients] = useState<any[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [clientName, setClientName] = useState("");
  const [category, setCategory] = useState<"fatura" | "declaracao" | "relatorio" | "outro">("outro");

  useEffect(() => {
    fetchClients().then(setClients);
    loadDocs();
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('documentos').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setDocs(data);
    }
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setUploadOpen(true);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;
    setUploading(true);
    toast.info("A fazer upload do ficheiro...", { id: "uploading" });

    // 1. Upload to Storage
    const fileExt = selectedFile.name.split('.').pop();
    const safeName = Math.random().toString(36).substring(2, 15);
    const filePath = `${Date.now()}_${safeName}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, selectedFile);

    if (uploadError) {
      toast.error("Erro no upload: " + uploadError.message, { id: "uploading" });
      setUploading(false);
      return;
    }

    // 2. Insert into Database
    const publicUrl = supabase.storage.from('documentos').getPublicUrl(filePath).data.publicUrl;

    const newDoc = {
      name: fileName,
      client: clientName || "Geral",
      type: fileExt?.toUpperCase() || "FILE",
      size: formatSize(selectedFile.size),
      uploaded_by: user?.user_metadata?.name || user?.email || "Admin",
      category,
      file_url: publicUrl,
    };

    const { data, error: dbError } = await supabase.from('documentos').insert([newDoc]).select('*').single();

    if (dbError) {
      toast.error("Erro ao gravar registo na BD", { id: "uploading" });
    } else {
      toast.success("Documento partilhado com sucesso!", { id: "uploading" });
      setDocs(prev => [data, ...prev]);
      setUploadOpen(false);
      setSelectedFile(null);
      setClientName("");
      setFileName("");
    }
    setUploading(false);
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Remover definitivamente o documento "${doc.name}"?`)) return;
    
    // Attempt delete from storage
    const path = doc.file_url.split('/documentos/').pop();
    if (path) {
      await supabase.storage.from('documentos').remove([path]);
    }
    
    // Delete from DB
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
    if (!error) {
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success("Documento apagado");
    }
  };

  const filtered = docs.filter(
    (d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.client?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentos</h1>
          <p className="text-muted-foreground mt-1">Gestão documental centralizada conectada à Nuvem</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
          />
          <Button className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Upload
          </Button>
        </div>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Pesquisar documentos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
      <div className="elevated-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Documento</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Categoria</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Tamanho</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Data</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => (
                <motion.tr
                  key={doc.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {fileIcon(doc.type)}
                      <div>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                          {doc.name}
                        </a>
                        <p className="text-xs text-muted-foreground">por {doc.uploaded_by}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-foreground">{doc.client}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={cn("text-xs capitalize", categoryConfig[doc.category]?.class)}>
                      {categoryConfig[doc.category]?.label || doc.category}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{doc.size}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{new Date(doc.created_at).toLocaleDateString("pt-PT")}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(doc)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum documento registado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={(open) => !uploading && setUploadOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Descarregar Ficheiro para Cloud</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome Alternativo</Label>
              <Input value={fileName} onChange={e => setFileName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente Destino (opcional)</Label>
              <Select value={clientName} onValueChange={setClientName}>
                <SelectTrigger><SelectValue placeholder="Assinatura Geral" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Geral">Sem cliente específico</SelectItem>
                  {clients.map(c => (
                     <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={v => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fatura">Fatura</SelectItem>
                  <SelectItem value="declaracao">Declaração</SelectItem>
                  <SelectItem value="relatorio">Relatório</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUploadSubmit} disabled={uploading || !fileName.trim()}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosPage;
