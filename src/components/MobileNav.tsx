import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { 
  Menu, LayoutDashboard, Users, ClipboardList, FileText, Receipt, 
  FileBarChart, MessageSquare, Building2, LogOut 
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/colaboradores", label: "Colaboradores", icon: Users },
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

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  
  const navItems = user?.role === "cliente" ? clientNavItems : adminNavItems;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="fixed top-4 left-4 z-50 md:hidden rounded-full shadow-lg bg-background border border-border w-12 h-12 flex items-center justify-center print:hidden hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col bg-background/95 backdrop-blur-md border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground">
            INTERCONTA
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary">{user?.name?.charAt(0) || "U"}</span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>Sair</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
