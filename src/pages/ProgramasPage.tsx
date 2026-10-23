import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  FileSearch2,
  FileSpreadsheet,
  Scale,
  Landmark,
  Calculator,
  ArrowRight,
  AppWindow,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const programas = [
  {
    id: "saft",
    title: "SAF-T",
    subtitle: "Analisador & Auditor SAF-T (PT)",
    description:
      "Validação e análise profunda de ficheiros SAF-T de faturação e contabilidade com processamento 100% local e seguro.",
    to: "/saft",
    icon: FileSearch2,
    badge: "Faturação & Auditoria",
    color: "from-blue-500/20 via-blue-500/10 to-transparent",
    iconColor: "text-blue-500",
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    features: ["Validação de estrutura", "Deteção de anomalias", "Resumos de IVA e clientes"],
  },
  {
    id: "efatura",
    title: "e-Fatura",
    subtitle: "Gestão e Extração e-Fatura",
    description:
      "Consulta, filtragem e descarregamento das faturas comunicadas à Autoridade Tributária com exportação direta para Excel.",
    to: "/efatura",
    icon: FileSpreadsheet,
    badge: "Autoridade Tributária",
    color: "from-emerald-500/20 via-emerald-500/10 to-transparent",
    iconColor: "text-emerald-500",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    features: ["Faturas emitidas e recebidas", "Exportação compatível", "Integração AT direta"],
  },
  {
    id: "reconciliacao",
    title: "Reconciliação",
    subtitle: "e-Fatura vs Contabilidade",
    description:
      "Cruzamento inteligente de faturas do e-Fatura com extratos de contabilidade em PDF e Excel, com pintura automática e deteção de divergências.",
    to: "/reconciliacao",
    icon: Scale,
    badge: "Reconciliação Contabilística",
    color: "from-purple-500/20 via-purple-500/10 to-transparent",
    iconColor: "text-purple-500",
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    features: ["Pintura a verde automática", "Relatório de divergências", "Exportação multi-folha"],
  },
  {
    id: "importacao-bancaria",
    title: "Importação Bancária",
    subtitle: "Extratos Bancários para Diários",
    description:
      "Conversão e formatação de movimentos bancários em folhas de cálculo prontas para importação direta no software de contabilidade.",
    to: "/importacao-bancaria",
    icon: Landmark,
    badge: "Banca & Tesouraria",
    color: "from-amber-500/20 via-amber-500/10 to-transparent",
    iconColor: "text-amber-500",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    features: ["Formato 'CDIARIO oficial", "Folha única limpa", "Compatível com ERPs"],
  },
  {
    id: "simuladores",
    title: "Simuladores",
    subtitle: "Cálculos Fiscais & Salariais",
    description:
      "Simulador completo de Salário Líquido, Custo Empresa, Simulador Inverso e Recibos Verdes atualizado com as tabelas de IRS e Segurança Social.",
    to: "/simuladores",
    icon: Calculator,
    badge: "Recursos Humanos & Fiscal",
    color: "from-rose-500/20 via-rose-500/10 to-transparent",
    iconColor: "text-rose-500",
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    features: ["Tabelas de retenção IRS", "Taxa Social Única (TSU)", "Cálculo inverso bruto/líquido"],
  },
];

export default function ProgramasPage() {
  const { user } = useAuth();

  if (user?.role === "cliente") {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <AppWindow className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Programas Interconta
              </h1>
              <p className="text-sm text-muted-foreground">
                Conjunto de ferramentas especializadas para contabilidade, faturação, banca e fiscalidade
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-muted/50 px-3.5 py-1.5 rounded-full text-xs text-muted-foreground w-fit">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>5 programas integrados</span>
        </div>
      </div>

      {/* Grid de Programas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {programas.map((prog) => {
          const Icon = prog.icon;
          return (
            <Card
              key={prog.id}
              className="group relative overflow-hidden flex flex-col justify-between border-border/80 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-card"
            >
              {/* Subtle top gradient */}
              <div
                className={`absolute top-0 left-0 right-0 h-28 bg-gradient-to-b ${prog.color} opacity-70 pointer-events-none transition-opacity group-hover:opacity-100`}
              />

              <CardHeader className="relative pb-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-background/80 backdrop-blur shadow-sm border border-border flex items-center justify-center ${prog.iconColor} group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <Badge variant="outline" className={`text-[11px] font-medium ${prog.badgeColor}`}>
                    {prog.badge}
                  </Badge>
                </div>
                <CardTitle className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                  {prog.title}
                </CardTitle>
                <p className="text-xs font-medium text-muted-foreground/80 mt-0.5">
                  {prog.subtitle}
                </p>
                <CardDescription className="text-xs text-muted-foreground leading-relaxed mt-2.5">
                  {prog.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="relative pt-0 space-y-4">
                <div className="pt-3 border-t border-border/50 space-y-1.5">
                  {prog.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Button
                    asChild
                    className="w-full justify-between group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-sm"
                  >
                    <Link to={prog.to}>
                      <span>Abrir {prog.title}</span>
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
