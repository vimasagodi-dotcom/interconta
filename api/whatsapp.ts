// Vercel Serverless Function: WhatsApp Bot & Remote Control API
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://rzktszngtyfswthgvbsf.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- 1. WEBHOOK VERIFICATION (GET) ---
  // Suporte para Meta WhatsApp Cloud API / Twilio
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'interconta_token_2026')) {
      return res.status(200).send(challenge);
    }

    return res.status(200).json({
      status: 'active',
      service: 'Interconta WhatsApp Remote Control API',
      timestamp: new Date().toISOString(),
      webhook_url: 'https://interconta.vercel.app/api/whatsapp',
    });
  }

  // --- 2. RECEÇÃO DE MENSAGENS E COMANDOS (POST) ---
  if (req.method === 'POST') {
    try {
      const body = req.body || {};

      // Extração agnóstica do texto e remetente (Meta, Twilio, Evolution API ou Simulador Web)
      let incomingText = '';
      let fromNumber = '';
      let isSimulator = false;

      // Formato Simulador / Direto
      if (body.message) {
        incomingText = String(body.message).trim();
        fromNumber = String(body.phone || 'utilizador_web').trim();
        isSimulator = true;
      }
      // Formato Twilio
      else if (body.Body) {
        incomingText = String(body.Body).trim();
        fromNumber = String(body.From || '').replace('whatsapp:', '').trim();
      }
      // Formato Meta WhatsApp Cloud API
      else if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msgObj = body.entry[0].changes[0].value.messages[0];
        fromNumber = msgObj.from;
        if (msgObj.type === 'text') {
          incomingText = msgObj.text?.body || '';
        }
      }
      // Formato Evolution API / Z-API
      else if (body.data?.message?.conversation || body.message?.conversation) {
        incomingText = body.data?.message?.conversation || body.message?.conversation || '';
        fromNumber = body.data?.key?.remoteJid || body.sender || '';
      }

      if (!incomingText) {
        return res.status(200).json({ success: true, message: 'No actionable message payload found' });
      }

      const lower = incomingText.toLowerCase().trim();
      let botResponse = '';

      // --- COMANDO: AJUDA / MENU ---
      if (lower === 'ajuda' || lower === 'help' || lower === 'menu' || lower === 'start' || lower === 'oi' || lower === 'ola' || lower === 'olá') {
        botResponse = `👋 *Olá! Bem-vindo ao Assistente Remoto Interconta*\n\n` +
          `Pode controlar e extrair dados fiscais diretamente daqui. Comandos disponíveis:\n\n` +
          `📊 *resumo [nif]*\n` +
          `↳ Devolve os totais mensais oficiais certificados pela AT.\n` +
          `   _Exemplo: resumo 518112098_\n\n` +
          `📥 *faturas [nif] [compras/vendas] [mês]*\n` +
          `↳ Extrai faturas reais da AT no período pretendido.\n` +
          `   _Exemplo: faturas 518112098 vendas 2026-01_\n\n` +
          `👥 *clientes*\n` +
          `↳ Lista as empresas e NIFs registados no gabinete.\n\n` +
          `📅 *prazos*\n` +
          `↳ Próximas obrigações fiscais e tarefas pendentes.\n\n` +
          `💬 Ou escreva qualquer pergunta em linguagem natural!`;
      }

      // --- COMANDO: RESUMO / TOTAIS MENSAS DA AT ---
      else if (lower.startsWith('resumo') || lower.startsWith('totais')) {
        const nifMatch = incomingText.match(/\b\d{9}\b/);
        const yearMatch = incomingText.match(/\b(202\d)\b/);
        const targetNif = nifMatch ? nifMatch[0] : '518112098';
        const targetYear = yearMatch ? yearMatch[0] : '2026';

        try {
          // Consultar Totais Mensais via endpoint e-fatura
          const efaturaRes = await fetch('https://interconta.vercel.app/api/efatura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nif: targetNif,
              password: targetNif === '518112098' ? 'M518112098' : 'ZC5AE7Z236U1',
              tipo: 'vendas',
              dataInicio: `${targetYear}-01-01`,
              dataFim: `${targetYear}-12-31`,
            }),
          });

          const efaturaData = await efaturaRes.json();
          if (efaturaData.success && efaturaData.totaisMensais && efaturaData.totaisMensais.length > 0) {
            let msg = `📊 *Totais Mensais Certificados AT (${targetYear})*\n` +
              `🏢 *Empresa:* ${efaturaData.companyName || targetNif}\n` +
              `🆔 *NIF:* ${targetNif}\n\n`;

            let sumFaturas = 0;
            let sumTotal = 0;
            let sumIva = 0;

            for (const row of efaturaData.totaisMensais) {
              sumFaturas += (row.numFaturas || 0);
              sumTotal += (row.total || 0);
              sumIva += (row.valorIva || 0);
              msg += `• *${row.mes}:* ${row.numFaturas.toLocaleString('pt-PT')} docs | IVA: ${row.valorIva.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} | Total: ${row.total.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}\n`;
            }

            msg += `\n━━━━━━━━━━━━━━━━━━━━\n` +
              `🏆 *TOTAL ANUAL:*\n` +
              `📁 Documentos: *${sumFaturas.toLocaleString('pt-PT')} faturas*\n` +
              `💰 IVA Total: *${sumIva.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}*\n` +
              `💶 Total Global: *${sumTotal.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}*\n\n` +
              `📥 Descarregar Excel completo: https://interconta.vercel.app/efatura`;

            botResponse = msg;
          } else {
            botResponse = `⚠️ Não foi possível obter os totais mensais para o NIF ${targetNif}. Verifique se o NIF está correto ou aceda a https://interconta.vercel.app/efatura.`;
          }
        } catch (e: any) {
          botResponse = `⚠️ Erro ao consultar a AT: ${e?.message || 'Falha de comunicação.'}`;
        }
      }

      // --- COMANDO: FATURAS ---
      else if (lower.startsWith('fatura') || lower.startsWith('faturas')) {
        const nifMatch = incomingText.match(/\b\d{9}\b/);
        const targetNif = nifMatch ? nifMatch[0] : '518112098';
        const targetTipo = lower.includes('compra') ? 'compras' : 'vendas';
        const monthMatch = incomingText.match(/202\d-(0[1-9]|1[0-2])/);
        const targetMonth = monthMatch ? monthMatch[0] : '2026-01';

        const lastDay = new Date(parseInt(targetMonth.split('-')[0], 10), parseInt(targetMonth.split('-')[1], 10), 0).getDate();
        const dataInicio = `${targetMonth}-01`;
        const dataFim = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;

        try {
          const efaturaRes = await fetch('https://interconta.vercel.app/api/efatura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nif: targetNif,
              password: targetNif === '518112098' ? 'M518112098' : 'ZC5AE7Z236U1',
              tipo: targetTipo,
              dataInicio,
              dataFim,
            }),
          });

          const efaturaData = await efaturaRes.json();
          if (efaturaData.success) {
            const count = efaturaData.count || 0;
            const company = efaturaData.companyName || targetNif;
            botResponse = `✅ *Extração de Faturas e-Fatura Concluída!*\n\n` +
              `🏢 *Empresa:* ${company}\n` +
              `🆔 *NIF:* ${targetNif}\n` +
              `📑 *Tipo:* ${targetTipo.toUpperCase()}\n` +
              `📅 *Período:* ${dataInicio} a ${dataFim}\n` +
              `📄 *Documentos Extraídos:* *${count.toLocaleString('pt-PT')} faturas*\n\n` +
              `📥 Pode descarregar o ficheiro Excel (.xlsx) diretamente em:\n` +
              `https://interconta.vercel.app/efatura`;
          } else {
            botResponse = `⚠️ ${efaturaData.error || 'A AT não devolveu documentos para os critérios indicados.'}`;
          }
        } catch (e: any) {
          botResponse = `⚠️ Erro ao extrair faturas: ${e?.message || 'Falha de comunicação com a AT.'}`;
        }
      }

      // --- COMANDO: CLIENTES ---
      else if (lower.includes('cliente') || lower.includes('empresas')) {
        try {
          const { data: clients } = await supabase.from('clientes').select('name, nif, localidade').eq('status', 'ativo').limit(15);
          if (clients && clients.length > 0) {
            let msg = `👥 *Clientes / Empresas Registadas (${clients.length}):*\n\n`;
            for (const c of clients) {
              msg += `• *${c.name}*\n  NIF: \`${c.nif || 'N/D'}\`${c.localidade ? ` | ${c.localidade}` : ''}\n`;
            }
            msg += `\nPara ver totais, envie: *resumo [NIF]*`;
            botResponse = msg;
          } else {
            botResponse = `👥 *Clientes do Gabinete:*\n• MISTERIO POETICO - LDA (NIF 518112098)\n• SERRALHARIA DE SILVEIROS LDA (NIF 503477281)\n• Vimasagodi Gabinete (NIF 508433797)`;
          }
        } catch {
          botResponse = `👥 *Clientes Principais:*\n• MISTERIO POETICO - LDA (NIF 518112098)\n• SERRALHARIA DE SILVEIROS LDA (NIF 503477281)\n• Vimasagodi Gabinete (NIF 508433797)`;
        }
      }

      // --- COMANDO: PRAZOS / TAREFAS ---
      else if (lower.includes('prazo') || lower.includes('tarefa') || lower.includes('fiscal') || lower.includes('obriga')) {
        botResponse = `📅 *Prazos Fiscais & Obrigações (Próximos Dias):*\n\n` +
          `🔴 *12 do Mês:* Comunicação mensal das Faturas à AT (e-Fatura)\n` +
          `🟡 *20 do Mês:* Entrega da Declaração Periódica do IVA (regime mensal)\n` +
          `🟢 *25 do Mês:* Pagamento do IVA e Retenções na Fonte (IRS/IRC)\n` +
          `🔵 *Fim do Mês:* Envio do ficheiro SAF-T de Faturação\n\n` +
          `Aceda ao calendário completo em: https://interconta.vercel.app/tarefas`;
      }

      // --- FALLBACK NATURAL COM GEMINI AI ---
      else {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
          try {
            const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `És o assistente AI do software Interconta para um gabinete de contabilidade em Portugal.
Responde de forma curta, profissional e adaptada ao WhatsApp (com emojis e negritos).
A mensagem do utilizador é: "${incomingText}".
Se o utilizador pedir dados fiscais ou faturas, indica que pode escrever "resumo [NIF]" ou "faturas [NIF]" para obter os dados em tempo real da AT.`
                      }
                    ]
                  }
                ]
              })
            });
            const aiData = await aiRes.json();
            botResponse = aiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
              `Recebi o seu pedido: "${incomingText}". Pode usar os comandos *resumo [nif]*, *faturas [nif]*, ou *clientes*.`;
          } catch {
            botResponse = `Recebi a sua mensagem: "${incomingText}". Para ver o menu de comandos, escreva *ajuda*.`;
          }
        } else {
          botResponse = `Recebi a sua mensagem: "${incomingText}". Para ver o menu de comandos, escreva *ajuda*.`;
        }
      }

      // Devolver a resposta processada
      return res.status(200).json({
        success: true,
        reply: botResponse,
        from: fromNumber,
        originalMessage: incomingText,
      });

    } catch (error: any) {
      console.error('Erro no processamento WhatsApp:', error);
      return res.status(500).json({
        success: false,
        error: `Erro no assistente WhatsApp: ${error?.message || 'Erro desconhecido'}`,
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
