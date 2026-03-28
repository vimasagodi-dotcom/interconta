import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bot,
  MessageSquare,
  Receipt,
  FileBarChart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/tarefas", label: "Tarefas", icon: ClipboardList },
  { to: "/documentos", label: "Documentos", icon: FileText },
  { to: "/faturacao", label: "Faturação", icon: Receipt },
];

const clientNavItems = [
  { to: "/portal", label: "Painel", icon: LayoutDashboard },
  { to: "/portal/conta", label: "Conta Corrente", icon: Receipt },
  { to: "/portal/documentos", label: "Documentos", icon: FileText },
  { to: "/portal/mensagens", label: "Mensagens", icon: MessageSquare },
];

const AppSidebar = () => {
  const { user, logout, impersonatedClient } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  
  const isImpersonating = !!impersonatedClient && location.pathname.startsWith("/portal");
  const navItems = (user?.role === "cliente" || isImpersonating) ? clientNavItems : adminNavItems;

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2 }}
      className="h-screen gradient-sidebar hidden md:flex flex-col border-r border-sidebar-border sticky top-0 z-30 print:hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-accent-foreground" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-lg font-bold text-sidebar-foreground whitespace-nowrap"
            >
              INTERCONTA
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}

        {user?.role !== "cliente" && !isImpersonating && (
          <div className="mt-6 pt-4 border-t border-sidebar-border/30">
            <AnimatePresence>
              {!collapsed && (
                <motion.p 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="px-3 mb-2 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-wider"
                >
                  Definições
                </motion.p>
              )}
            </AnimatePresence>
            <NavLink
              to="/definicoes"
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                    Configurações
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          </div>
        )}
      </nav>

      {/* User info + collapse */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-xs font-bold text-accent-foreground flex-shrink-0">
            {user?.avatar || "U"}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
                <p className="text-xs text-sidebar-foreground/50 capitalize">{user?.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all flex-1"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </motion.aside>
  );
};

export default AppSidebar;
