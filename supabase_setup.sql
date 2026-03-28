-- 1. Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numeroCliente TEXT,
  name TEXT NOT NULL,
  nif TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  type TEXT,
  status TEXT DEFAULT 'ativo',
  regimeIva TEXT,
  regime_contabilidade TEXT,
  morada TEXT,
  codigoPostal TEXT,
  localidade TEXT,
  valorAvenca DECIMAL(10,2) DEFAULT 0,
  saldo DECIMAL(10,2) DEFAULT 0,
  dmr BOOLEAN DEFAULT false,
  saft BOOLEAN DEFAULT false,
  irc BOOLEAN DEFAULT false,
  ies BOOLEAN DEFAULT false,
  tsu_tipo TEXT DEFAULT 'Nenhuma',
  decl_trimestral_tsu BOOLEAN DEFAULT false,
  salarios BOOLEAN DEFAULT false,
  inventario BOOLEAN DEFAULT false,
  modelo_10 BOOLEAN DEFAULT false,
  inscrito_vies BOOLEAN DEFAULT false,
  rcbe TEXT,
  validade_rcbe DATE,
  codigo_certidao_permanente TEXT,
  validade_certidao_permanente DATE,
  observacoes TEXT,
  avenca_automatica BOOLEAN DEFAULT true, -- NOVA COLUNA
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Movimentos de Faturação (Conta Corrente)
CREATE TABLE IF NOT EXISTS movimentos_faturacao (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'fatura', 'pagamento', 'avenca'
  data DATE NOT NULL,
  descricao TEXT,
  valor DECIMAL(10,2) NOT NULL,
  pdf_link TEXT,
  toconline_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Relatórios Mensais (Controlo de Obrigações)
CREATE TABLE IF NOT EXISTS relatorios_mensais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  obrigacao TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cliente_id, ano, mes, obrigacao)
);

-- 4. Configurações Fiscais (Datas Limite por Ano)
CREATE TABLE IF NOT EXISTS fiscal_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ano INTEGER NOT NULL,
  obrigacao TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'mensal', 'anual'
  mes_entrega INTEGER,
  dia_limite INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ano, obrigacao)
);

-- 5. Tarefas (Kanban)
CREATE TABLE IF NOT EXISTS tarefas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  client TEXT,
  responsible TEXT,
  due_date DATE,
  priority TEXT DEFAULT 'media',
  status TEXT DEFAULT 'por_fazer',
  recurrence TEXT DEFAULT 'pontual',
  template_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Colaboradores (Extensão do Auth)
CREATE TABLE IF NOT EXISTS colaboradores (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'colaborador',
  ferias_transitadas DECIMAL(4,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Férias e Faltas
CREATE TABLE IF NOT EXISTS ferias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL, -- 'full', 'morning', 'afternoon', 'falta', 'baixa'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Documentos (Metadados)
CREATE TABLE IF NOT EXISTS documentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  client TEXT,
  type TEXT,
  size TEXT,
  uploaded_by TEXT,
  category TEXT, -- 'fatura', 'declaracao', 'relatorio', 'outro'
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- NOTA: O bucket 'documentos' deve ser criado manualmente no Supabase Storage como PUBLICO.
