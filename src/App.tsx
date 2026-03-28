import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import ClientesPage from "@/pages/ClientesPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import TarefasPage from "@/pages/TarefasPage";
import LancamentosPage from "@/pages/LancamentosPage";
import DocumentosPage from "@/pages/DocumentosPage";
import FaturacaoPage from "@/pages/FaturacaoPage";
import DefinicoesPage from "@/pages/DefinicoesPage";
import PortalPage from "@/pages/PortalPage";
import PortalContaPage from "@/pages/PortalContaPage";
import PortalDocumentosPage from "@/pages/PortalDocumentosPage";
import PortalMensagensPage from "@/pages/PortalMensagensPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.role === "cliente") {
    return (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/portal/conta" element={<PortalContaPage />} />
          <Route path="/portal/documentos" element={<PortalDocumentosPage />} />
          <Route path="/portal/mensagens" element={<PortalMensagensPage />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Admin/Colaborador Routes */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route path="/lancamentos" element={<LancamentosPage />} />
        <Route path="/documentos" element={<DocumentosPage />} />
        <Route path="/faturacao" element={<FaturacaoPage />} />
        <Route path="/definicoes" element={<DefinicoesPage />} />
        
        {/* Portal Routes for Impersonation (Admin viewing as Client) */}
        <Route path="/portal" element={<PortalPage />} />
        <Route path="/portal/conta" element={<PortalContaPage />} />
        <Route path="/portal/documentos" element={<PortalDocumentosPage />} />
        <Route path="/portal/mensagens" element={<PortalMensagensPage />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
};

const LoginRoute = () => {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={user?.role === "cliente" ? "/portal" : "/dashboard"} replace />;
  }
  return <LoginPage />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
