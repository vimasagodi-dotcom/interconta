import React, { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy loading das páginas para arranque ultra-rápido do Interconta
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ClientesPage = lazy(() => import("@/pages/ClientesPage"));
const RelatoriosPage = lazy(() => import("@/pages/RelatoriosPage"));
const TarefasPage = lazy(() => import("@/pages/TarefasPage"));
const LancamentosPage = lazy(() => import("@/pages/LancamentosPage"));
const DocumentosPage = lazy(() => import("@/pages/DocumentosPage"));
const FaturacaoPage = lazy(() => import("@/pages/FaturacaoPage"));
const DefinicoesPage = lazy(() => import("@/pages/DefinicoesPage"));
const PortalPage = lazy(() => import("@/pages/PortalPage"));
const SafTPage = lazy(() => import("@/pages/SafTPage"));
const EFaturaPage = lazy(() => import("@/pages/EFaturaPage"));
const WhatsAppPage = lazy(() => import("@/pages/WhatsAppPage"));
const SimuladoresPage = lazy(() => import("@/pages/SimuladoresPage"));
const PortalContaPage = lazy(() => import("@/pages/PortalContaPage"));
const PortalDocumentosPage = lazy(() => import("@/pages/PortalDocumentosPage"));
const PortalMensagensPage = lazy(() => import("@/pages/PortalMensagensPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const PageLoader = () => (
  <div className="flex h-[60vh] w-full items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);


const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.role === "cliente") {
    return (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/portal" replace />} />
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/portal/conta" element={<PortalContaPage />} />
          <Route path="/portal/documentos" element={<PortalDocumentosPage />} />
          <Route path="/portal/mensagens" element={<PortalMensagensPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Root Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Admin/Colaborador Routes */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route path="/lancamentos" element={<LancamentosPage />} />
        <Route path="/documentos" element={<DocumentosPage />} />
        <Route path="/faturacao" element={<FaturacaoPage />} />
        <Route path="/saft" element={<SafTPage />} />
        <Route path="/efatura" element={<EFaturaPage />} />
        <Route path="/simuladores" element={<SimuladoresPage />} />
        <Route path="/whatsapp" element={<Navigate to="/simuladores" replace />} />
        <Route path="/definicoes" element={<DefinicoesPage />} />

        {/* Portal Routes for Impersonation (Admin viewing as Client) */}
        <Route path="/portal" element={<PortalPage />} />
        <Route path="/portal/conta" element={<PortalContaPage />} />
        <Route path="/portal/documentos" element={<PortalDocumentosPage />} />
        <Route path="/portal/mensagens" element={<PortalMensagensPage />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFound />} />
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

const PublicSimuladorRoute = () => {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <NavLink to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            ← Voltar ao Início
          </NavLink>
          <NavLink to="/login">
            <Button size="sm">Entrar no Sistema</Button>
          </NavLink>
        </div>
        <SimuladoresPage />
      </div>
    </div>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            {/* <AgendaNotificationManager /> */}
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/simulador" element={<PublicSimuladorRoute />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
