import { Outlet, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import ChatAssistant from "@/components/ChatAssistant";
import { MessageAssistant } from "@/components/MessageAssistant";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

const AppLayout = () => {
  const { user, impersonatedClient, impersonate } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || user?.role === "colaborador";

  return (
    <div className="flex min-h-screen bg-background flex-col md:flex-row font-inter">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 overflow-auto pt-20 md:pt-0 relative">
        {impersonatedClient && (
          <div className="p-4 pb-0 max-w-[1200px] mx-auto w-full sticky top-0 md:top-6 z-40">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between gap-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shadow-inner">
                  <User className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent leading-none">Modo de Visualização</p>
                  <p className="text-xs text-muted-foreground mt-1">Está a ver o portal como <strong>{impersonatedClient.name}</strong></p>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-accent/30 text-accent hover:bg-accent/10 h-8 font-medium"
                onClick={() => {
                  impersonate(null);
                  navigate("/dashboard");
                }}
              >
                Sair do modo cliente
              </Button>
            </motion.div>
          </div>
        )}
        <Outlet />
        {isAdmin && <MessageAssistant />}
      </main>
      {!isAdmin && user && <ChatAssistant />}
    </div>
  );
}

export default AppLayout;
