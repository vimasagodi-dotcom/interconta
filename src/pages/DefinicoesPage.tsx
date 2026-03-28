import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FiscalConfigPanel from "@/components/FiscalConfigPanel";
import ColaboradoresPanel from "@/components/ColaboradoresPanel";
import ClientesConfigPanel from "@/components/ClientesConfigPanel";
import { Settings, Users, Calendar, ChevronDown, ShieldCheck } from "lucide-react";

const DefinicoesPage = () => {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const sections = [
    {
      id: "fiscal",
      title: "Parametrização de Prazos Legais",
      description: "Configuração de datas limite para DMR, SAF-T, Pagamentos, etc.",
      icon: Calendar,
      component: <FiscalConfigPanel />,
    },
    {
      id: "colaboradores",
      title: "Gestão de Colaboradores",
      description: "Administração de acessos, perfis e registo de faltas/férias.",
      icon: Users,
      component: <ColaboradoresPanel />,
    },
    {
      id: "clientes-config",
      title: "Configurações Clientes",
      description: "Gestão de acessos ao portal, permissões de faturação e documentos.",
      icon: ShieldCheck,
      component: <ClientesConfigPanel />,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <Settings className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Definições</h1>
          <p className="text-muted-foreground mt-0.5">Gestão centralizada do seu gabinete</p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="elevated-card rounded-xl overflow-hidden border border-border/50">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{section.title}</h3>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: openSection === section.id ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            </button>

            <AnimatePresence>
              {openSection === section.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <div className="p-6 pt-0 border-t border-border/50 bg-muted/5">
                    {section.component}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center opacity-40">
        <p className="text-sm font-medium text-muted-foreground italic">Novas definições gerais estarão disponíveis brevemente.</p>
      </div>
    </div>
  );
};

export default DefinicoesPage;
