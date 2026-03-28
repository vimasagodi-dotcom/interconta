import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface FeriasDay {
  id: string;
  colaboradorId: string;
  date: string; // YYYY-MM-DD
  type: "full" | "morning" | "afternoon" | "falta" | "baixa";
  notes?: string;
}

export const fetchFerias = async (): Promise<FeriasDay[]> => {
  const { data } = await supabase.from('ferias').select('*');
  if (!data) return [];
  return data.map(d => ({
    id: d.id,
    colaboradorId: d.colaborador_id,
    date: d.date,
    type: d.type,
    notes: d.notes
  }));
};

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) { const day = new Date(year, month, 1).getDay(); return day === 0 ? 6 : day - 1; }
function isWeekend(year: number, month: number, day: number) { const d = new Date(year, month, day).getDay(); return d === 0 || d === 6; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId: string;
  colaboradorName: string;
  feriasTransitadas: number;
}

const FeriasCalendarDialog = ({ open, onOpenChange, colaboradorId, colaboradorName, feriasTransitadas }: Props) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [feriasDays, setFeriasDays] = useState<FeriasDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [activeNoteDate, setActiveNoteDate] = useState<string | null>(null);
  const [activeNoteText, setActiveNoteText] = useState("");

  useEffect(() => {
    if (open && colaboradorId) {
      setLoading(true);
      fetchFerias().then(data => {
        setFeriasDays(data);
        setLoading(false);
      });
    }
  }, [open, colaboradorId]);

  const colabDays = useMemo(
    () => feriasDays.filter(f => f.colaboradorId === colaboradorId && f.date.startsWith(String(year))),
    [feriasDays, colaboradorId, year]
  );

  const colabDaysMap = useMemo(() => {
    const map: Record<string, FeriasDay> = {};
    colabDays.forEach(d => { map[d.date] = d; });
    return map;
  }, [colabDays]);

  const handleDayClick = async (dateStr: string) => {
    const existing = colabDaysMap[dateStr];
    
    // UI Optimistic Update
    setFeriasDays(prev => {
      if (!existing) {
        return [...prev, { id: `temp-${Date.now()}`, colaboradorId, date: dateStr, type: "full" }];
      } else if (existing.type === "full") {
        return prev.map(f => f.id === existing.id ? { ...f, type: "morning" } : f);
      } else if (existing.type === "morning") {
        return prev.map(f => f.id === existing.id ? { ...f, type: "afternoon" } : f);
      } else if (existing.type === "afternoon") {
        return prev.map(f => f.id === existing.id ? { ...f, type: "falta" } : f);
      } else if (existing.type === "falta") {
        return prev.map(f => f.id === existing.id ? { ...f, type: "baixa" } : f);
      } else {
        return prev.filter(f => f.id !== existing.id);
      }
    });

    // DB Sync
    if (!existing) {
      await supabase.from('ferias').insert([{ colaborador_id: colaboradorId, date: dateStr, type: 'full' }]);
    } else if (existing.type === "full") {
      await supabase.from('ferias').update({ type: 'morning' }).eq('id', existing.id);
    } else if (existing.type === "morning") {
      await supabase.from('ferias').update({ type: 'afternoon' }).eq('id', existing.id);
    } else if (existing.type === "afternoon") {
      await supabase.from('ferias').update({ type: 'falta' }).eq('id', existing.id);
    } else if (existing.type === "falta") {
      await supabase.from('ferias').update({ type: 'baixa' }).eq('id', existing.id);
    } else {
      await supabase.from('ferias').delete().eq('id', existing.id);
    }
    
    // Silently re-sync to guarantee accurate true DB IDs
    fetchFerias().then(setFeriasDays);
  };

  const saveNote = async () => {
    if (!activeNoteDate) return;
    const existing = colabDaysMap[activeNoteDate];
    if (!existing) return;
    
    // Optimistic UI updates
    setFeriasDays(prev => prev.map(f => f.id === existing.id ? { ...f, notes: activeNoteText } : f));
    setNoteDialogOpen(false);
    
    // DB sync
    await supabase.from('ferias').update({ notes: activeNoteText }).eq('id', existing.id);
  };

  const totalDays = useMemo(() => {
    return colabDays.reduce((acc, d) => {
      if (d.type === "full") return acc + 1;
      if (d.type === "morning" || d.type === "afternoon") return acc + 0.5;
      return acc;
    }, 0);
  }, [colabDays]);
  
  const totalAllowed = 22 + (feriasTransitadas || 0);
  const daysRemaining = totalAllowed - totalDays;

  const monthStats = useMemo(() => {
    const stats: Record<number, number> = {};
    colabDays.forEach(d => {
      const m = parseInt(d.date.split("-")[1], 10) - 1;
      let val = 0;
      if (d.type === "full") val = 1;
      else if (d.type === "morning" || d.type === "afternoon") val = 0.5;
      stats[m] = (stats[m] || 0) + val;
    });
    return stats;
  }, [colabDays]);

  const clearAll = async () => {
    if (!confirm(`Limpar TODAS as férias de ${colaboradorName} em ${year}?`)) return;
    setLoading(true);
    await supabase.from('ferias')
      .delete()
      .eq('colaborador_id', colaboradorId)
      .like('date', `${year}-%`);
      
    fetchFerias().then(data => {
      setFeriasDays(data);
      setLoading(false);
      toast.success(`Férias limpas para ${year}`);
    });
  };

  const generateReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Relatório de Faltas e Férias — ${colaboradorName}`, 14, 20);
    doc.setFontSize(11);
    doc.text(`Ano: ${year}`, 14, 28);
    doc.text(`Base Anual: 22 dias | Transitados: ${feriasTransitadas} dias | Total Disponível: ${totalAllowed} dias`, 14, 35);
    doc.text(`Gozados: ${totalDays} dias | Restantes: ${daysRemaining} dias`, 14, 42);

    const rows = colabDays
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => {
        const dt = new Date(d.date);
        return [
          dt.toLocaleDateString("pt-PT"),
          WEEKDAYS_PT[(dt.getDay() === 0 ? 6 : dt.getDay() - 1)],
          d.type === "full" ? "Dia completo" : d.type === "morning" ? "Manhã" : d.type === "afternoon" ? "Tarde" : d.type === "falta" ? "Falta" : "Baixa",
          d.type === "full" ? "1" : (d.type === "morning" || d.type === "afternoon") ? "0.5" : "0",
        ];
      });

    autoTable(doc, {
      startY: 49,
      head: [["Data", "Dia", "Período", "Dias"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    const summaryY = (doc as any).lastAutoTable?.finalY + 12 || 120;
    doc.setFontSize(12);
    doc.text("Resumo Mensal", 14, summaryY);

    const summaryRows = MONTHS_PT.map((name, i) => [name, String(monthStats[i] || 0)]);
    autoTable(doc, {
      startY: summaryY + 5,
      head: [["Mês", "Dias"]],
      body: summaryRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`ferias_${colaboradorName.replace(/\s+/g, "_")}_${year}.pdf`);
    toast.success("Relatório gerado com sucesso");
  };

  const getDayClass = (dateStr: string) => {
    const entry = colabDaysMap[dateStr];
    if (!entry) return "";
    if (entry.type === "full") return "bg-primary text-primary-foreground";
    if (entry.type === "morning") return "bg-gray-600 text-white";
    if (entry.type === "afternoon") return "bg-primary/20 text-foreground ring-1 ring-primary/40";
    if (entry.type === "falta") return "bg-orange-500 text-white";
    if (entry.type === "baixa") return "bg-red-500 text-white";
    return "";
  };

  const getDayLabel = (dateStr: string) => {
    const entry = colabDaysMap[dateStr];
    if (!entry) return null;
    if (entry.type === "morning") return "M";
    if (entry.type === "afternoon") return "T";
    if (entry.type === "falta") return "F";
    if (entry.type === "baixa") return "B";
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span>Faltas/Férias — {colaboradorName}</span>
            <div className="flex gap-2 text-xs font-normal">
               <Badge variant="secondary">{totalDays} gozados</Badge>
               <Badge variant="outline" className={cn(daysRemaining < 0 ? "text-destructive border-destructive" : "text-primary border-primary")}>
                 {daysRemaining} restantes de {totalAllowed}
               </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: currentYear - 2026 + 2 }, (_, i) => 2026 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={clearAll} disabled={loading}>
              <Trash2 className="w-3.5 h-3.5" />Limpar
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={generateReport} disabled={colabDays.length === 0}>
              <Download className="w-3.5 h-3.5" />Relatório PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-primary" /> Completo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-gray-600" /> Manhã
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-primary/20 ring-1 ring-primary/40" /> Tarde
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-orange-500" /> Falta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-red-500" /> Baixa
          </span>
        </div>
        <div className="text-right text-xs text-muted-foreground italic mb-2">
           Clique Esq: ciclar tipo | Clique Dir. num registo: adicionar nota
        </div>

        {loading ? (
           <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {MONTHS_PT.map((monthName, monthIdx) => {
            const daysInMonth = getDaysInMonth(year, monthIdx);
            const firstDay = getFirstDayOfWeek(year, monthIdx);

            return (
              <div key={monthIdx} className="border border-border rounded-lg p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-foreground">{monthName}</span>
                  {monthStats[monthIdx] && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{monthStats[monthIdx]}d</Badge>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-px text-center">
                  {WEEKDAYS_PT.map(w => (
                    <span key={w} className="text-[9px] text-muted-foreground font-medium py-0.5">{w[0]}</span>
                  ))}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <span key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, d) => {
                    const day = d + 1;
                    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const weekend = isWeekend(year, monthIdx, day);
                    const label = getDayLabel(dateStr);
                    return (
                      <button
                        key={day}
                        onClick={() => !weekend && handleDayClick(dateStr)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!weekend && colabDaysMap[dateStr]) {
                            setActiveNoteDate(dateStr);
                            setActiveNoteText(colabDaysMap[dateStr].notes || "");
                            setNoteDialogOpen(true);
                          }
                        }}
                        disabled={weekend}
                        className={cn(
                          "relative w-full aspect-square flex items-center justify-center text-[10px] rounded transition-colors",
                          weekend ? "text-muted-foreground/30 cursor-default" : "hover:bg-accent cursor-pointer",
                          getDayClass(dateStr)
                        )}
                        title={
                          weekend ? "Fim de semana" :
                          colabDaysMap[dateStr]?.notes ? `${day} ${monthName}\n\nNota: ${colabDaysMap[dateStr].notes}` :
                          `${day} ${monthName} — Clique Esq: marcar | Clique Dir: nota`
                        }
                      >
                         <span className="z-10 relative">{day}</span>
                        {label && (
                          <span className="absolute -top-0.5 -right-0.5 text-[7px] font-bold z-20">{label}</span>
                        )}
                        {colabDaysMap[dateStr]?.notes && (
                           <span className="absolute -bottom-0.5 right-0.5 text-[10px] text-yellow-500 font-bold z-20">•</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </DialogContent>

      {/* Input de Nota Dialog Overlay */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nota do Feriado / Férias</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Descrição / Nota</label>
              <textarea
                className="w-full flex min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
                value={activeNoteText}
                onChange={e => setActiveNoteText(e.target.value)}
                placeholder="Ex: Ida ao Médico..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Fechar</Button>
            <Button onClick={saveNote}>Guardar Nota</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default FeriasCalendarDialog;
