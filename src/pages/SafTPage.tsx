import React, { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { ShieldCheck, Upload, Info, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SafTPage = () => {
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Only admin/colaborador can access this page
  if (user?.role === "cliente") {
    return <Navigate to="/portal" replace />;
  }

  const analyzerPath = "/analisador-saft/index.html";

  return (
    <div className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 bg-background" : "h-full"}`}>
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Analisador SAF-T</h1>
            <p className="text-xs text-muted-foreground">
              Processamento 100% local — os seus dados nunca saem do browser
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <Info className="w-3.5 h-3.5" />
            <span>Carregue um ficheiro SAF-T (XML) para começar</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Sair de ecrã completo" : "Ecrã completo"}
          >
            {fullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={analyzerPath}
          title="Analisador SAF-T"
          className="w-full h-full border-none"
          style={{ minHeight: "calc(100vh - 130px)" }}
          allow="downloads"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-modals"
        />
      </div>
    </div>
  );
};

export default SafTPage;
