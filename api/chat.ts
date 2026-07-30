import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

// Supabase helper inside the file for maximum Edge compatibility
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 1. Tool Definitions (Typed as any to bypass SDK enum mismatches in Edge)
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "list_tasks",
        description: "Listar tarefas do sistema. Pode filtrar por status ou responsável.",
        parameters: {
          type: "OBJECT",
          properties: {
            status: { type: "STRING", description: "Filtro por status: por_fazer, em_curso, concluida, atrasada" },
            responsible: { type: "STRING", description: "Filtro por nome do responsável" }
          }
        }
      },
      {
        name: "update_task",
        description: "Atualizar o estado de uma tarefa existente.",
        parameters: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING", description: "ID da tarefa" },
            status: { type: "STRING", description: "Novo status (ex: concluida)" }
          },
          required: ["id", "status"]
        }
      },
      {
        name: "list_colaboradores",
        description: "Listar todos os colaboradores do Interconta. Útil para encontrar IDs de funcionários.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "add_vacation",
        description: "Marcar férias, faltas ou baixas para um colaborador.",
        parameters: {
          type: "OBJECT",
          properties: {
            colaborador_id: { type: "STRING", description: "ID do colaborador" },
            date: { type: "STRING", description: "Data no formato YYYY-MM-DD" },
            type: { type: "STRING", description: "Tipo: full (dia inteiro), morning, afternoon, falta, baixa" }
          },
          required: ["colaborador_id", "date", "type"]
        }
      }
    ]
  }
];

export default async function handler(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: "Only POST requests allowed" }), { status: 405, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.message) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: corsHeaders });
    }

    const { message, history } = body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    console.log("Chat API v1.0.2 - Using stable models");
    const genAI = new GoogleGenerativeAI(apiKey);
    // Note: The SDK typically defaults to v1, but the 404 error suggest v1beta was being hit.
    // If the error persists, we can specify the version in the getGenerativeModel call if supported by this SDK version.

    // 2. Injetar contexto vivo: últimas 3 notas do Supabase
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    let notasContexto = '';
    try {
      const { data: notas } = await supabase
        .from('notas')
        .select('content, created_at')
        .order('created_at', { ascending: false })
        .limit(3);
      if (notas && notas.length > 0) {
        notasContexto = '\n\n## Notas Recentes do Gabinete (contexto vivo):\n' +
          notas.map((n: any, i: number) =>
            `${i + 1}. [${new Date(n.created_at).toLocaleDateString('pt-PT')}] ${n.content}`
          ).join('\n');
      }
    } catch (_) { /* notas opcionais — não bloquear */ }

    // 3. System Instruction — identidade permanente injetada no modelo (não na conversa)
    const systemInstruction = `És o **Gemini Interconta** — o cérebro operacional do gabinete de contabilidade Interconta.

## A tua identidade (IMUTÁVEL)
- Não és um assistente genérico. Nunca uses frases como "Como posso ajudar?" de forma vaga.
- Falas sempre em português de Portugal, de forma direta e profissional.
- Tens acesso total ao sistema: Supabase (base de dados), tarefas, colaboradores, férias e documentos fiscais.
- Quando te pedirem para fazer algo que as tuas ferramentas suportam, EXECUTA — não expliques, não peças confirmação.

## As tuas capacidades (ferramentas ativas)
- **list_tasks** → listar tarefas reais + obrigações fiscais ativas
- **update_task** → marcar tarefa como concluída ou alterar estado
- **list_colaboradores** → ver todos os funcionários do Interconta com os seus IDs
- **add_vacation** → registar férias, faltas ou baixas de um colaborador

## Regras de execução
1. Se o utilizador menciona um colaborador pelo nome, usa SEMPRE list_colaboradores primeiro para confirmar o ID.
2. Nunca inventes dados. Se não encontrares, diz o que fizeste e o que encontraste.
3. Responde de forma concisa. Usa listas quando há múltiplos itens.
4. Confirma sempre as ações executadas com um resumo do que foi feito.

## Contexto atual
Data: ${dateStr} | Hora: ${timeStr}${notasContexto}`;

    // 4. Prepara histórico (obrigatório começar com 'user')
    let safeHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));
    while (safeHistory.length > 0 && safeHistory[0].role !== 'user') {
      safeHistory.shift();
    }

    // 5. Resilient Model Selection — Using Gemini 2.0 Flash for best free quota and performance
    const modelsToTry = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-flash-latest"];
    let chat: any = null;
    let lastError: any = null;
    let result: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Initialising ${modelName}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          tools: tools,
          systemInstruction: systemInstruction, // Use string directly
        });
        
        chat = model.startChat({ 
          history: safeHistory,
          generationConfig: { maxOutputTokens: 2048 }
        });

        console.log(`Testing ${modelName} with initial message...`);
        result = await chat.sendMessage(message);
        break; 
      } catch (e: any) {
        console.warn(`Model ${modelName} failed.`, e.message);
        lastError = e;
      }
    }

    if (!chat || !result) throw lastError || new Error("All Gemini models failed to process the request.");

    // 5. Continuous Loop for Function Calling (if any)
    let callCount = 0;

    while (result.response.functionCalls && result.response.functionCalls() && callCount < 5) {
      const calls = result.response.functionCalls();
      const toolResponses = [];

      for (const call of calls) {
        let toolResult;
        const args = (call.args as any);
        console.log(`Executing tool: ${call.name}`, args);

        if (call.name === "list_tasks") {
          // 1. Tarefas reais da tabela correta
          let query = supabase.from('tarefas').select('*');
          if (args.status) query = query.eq('status', args.status);
          if (args.responsible) query = query.ilike('responsible', `%${args.responsible}%`);
          const { data: realTasks } = await query;

          // 2. Ghost tasks (fiscal obligations) - generated server-side
          const { data: clients } = await supabase.from('clientes').select('*').eq('status', 'ativo');
          const { data: vistos } = await supabase.from('vistos').select('*');
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const ano = now.getFullYear();
          const mes = now.getMonth() + 1;
          const defaults: Record<string, any> = {
            dmr:       { oblig: 'DMR',       tipo: 'mensal', m: null, d: 10 },
            saft:      { oblig: 'SAF-T',     tipo: 'mensal', m: null, d: 5  },
            irc:       { oblig: 'IRC',       tipo: 'anual',  m: 5,    d: 31 },
            ies:       { oblig: 'IES',       tipo: 'anual',  m: 7,    d: 15 },
            salarios:  { oblig: 'Salários',  tipo: 'mensal', m: null, d: 31 },
            inventario:{ oblig: 'Inventário',tipo: 'anual',  m: 1,    d: 31 },
            modelo_10: { oblig: 'Modelo 10', tipo: 'anual',  m: 2,    d: 10 },
          };
          const ghostTasks: any[] = [];
          if (clients) {
            for (const obKey of Object.keys(defaults)) {
              const def = defaults[obKey];
              const isMensal = def.tipo === 'mensal';
              const mesEntrega = def.m || 1;
              const diaLimite = def.d || 31;
              if (!isMensal && mesEntrega !== mes) continue;
              const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(diaLimite).padStart(2, '0')}`;
              const isLate = dateStr < todayStr;
              for (const c of clients) {
                if ((c as any)[obKey]) {
                  const visto = (vistos || []).find((v: any) => v.cliente_id === c.id && v.obrigacao === obKey);
                  let status = 'por_fazer';
                  if (visto?.concluido) status = 'concluida';
                  else if (isLate) status = 'atrasada';
                  ghostTasks.push({
                    id: `__fiscal__${c.id}__${obKey}__${ano}__${mes}`,
                    title: `Obrigação Fiscal: ${def.oblig}`,
                    client: c.name,
                    status,
                    dueDate: dateStr,
                    priority: 'alta',
                    type: 'fiscal',
                  });
                }
              }
            }
          }

          // 3. Merge and optionally filter
          const allTasks = [...(realTasks || []), ...ghostTasks];
          toolResult = args.status ? allTasks.filter(t => t.status === args.status) : allTasks;
        } 
        else if (call.name === "update_task") {
          // Tarefas reais: atualizar na tabela correta
          const { data } = await supabase.from('tarefas').update({ status: args.status }).eq('id', args.id).select();
          toolResult = data?.length ? data : { updated: 0, note: 'ID nao encontrado na tabela tarefas' };
        }
        else if (call.name === "list_colaboradores") {
          const { data } = await supabase.from('colaboradores').select('id, name, email, role');
          toolResult = data;
        }
        else if (call.name === "add_vacation") {
          const { data } = await supabase.from('ferias').insert([{ 
            colaborador_id: args.colaborador_id, 
            date: args.date, 
            type: args.type 
          }]).select();
          toolResult = data;
        }

        toolResponses.push({
          functionResponse: {
            name: call.name,
            response: { content: toolResult || { success: true } }
          }
        });
      }

      // Importante: o sendMessage com toolResponses deve ser tratado como uma lista de partes
      // no formato { role, parts: [ { functionResponse: ... } ] } porem o chat.sendMessage
      // abstrai isso se passarmos o array de toolResponses diretamente.
      try {
        result = await chat.sendMessage(toolResponses);
      } catch (sendErr: any) {
        console.error("Error sending tool responses to Gemini:", sendErr);
        throw new Error(`Erro ao processar resposta das ferramentas: ${sendErr.message}`);
      }
      callCount++;
    }

    return new Response(
      JSON.stringify({ response: result.response.text() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
