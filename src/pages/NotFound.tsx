import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Building2, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: Utilizador tentou aceder a uma rota inexistente:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-foreground">404</h1>
        <p className="text-lg font-medium text-foreground">Página não encontrada</p>
        <p className="text-sm text-muted-foreground">
          A página ou recurso que procura não existe ou foi movido.
        </p>
        <div className="pt-2">
          <Button asChild className="gap-2">
            <Link to="/dashboard">
              <Home className="w-4 h-4" />
              Voltar ao Início
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
