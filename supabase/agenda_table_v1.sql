-- Tabela de Agenda de Eventos
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    color TEXT DEFAULT 'primary',
    google_event_id TEXT,
    is_private BOOLEAN DEFAULT false
);

-- Ativar RLS
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (Somente Staff da Interconta)
-- Permitir que todos os colaboradores vejam eventos públicos da agenda
CREATE POLICY "Colaboradores podem ver eventos" 
ON public.agenda_eventos FOR SELECT 
TO authenticated 
USING (NOT is_private OR auth.uid() = created_by);

-- Permitir que colaboradores criem eventos
CREATE POLICY "Colaboradores podem criar eventos" 
ON public.agenda_eventos FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by);

-- Permitir que o criador do evento o edite ou apague
CREATE POLICY "Colaboradores podem gerir os seus eventos" 
ON public.agenda_eventos FOR ALL 
TO authenticated 
USING (auth.uid() = created_by);
