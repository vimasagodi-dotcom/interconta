import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper: ler token do Supabase app_settings
async function getSetting(supabase: any, key: string): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
  return data?.value || '';
}

// Helper: gravar token no Supabase app_settings
async function setSetting(supabase: any, key: string, value: string) {
  await supabase.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientId     = (process.env.TOC_CLIENT_ID || '').trim();
    const clientSecret = (process.env.TOC_CLIENT_SECRET || '').trim();
    const authUrl = (process.env.TOC_AUTH_URL || 'https://app17.toconline.pt/oauth').trim();
    const apiUrl  = (process.env.TOC_API_URL || 'https://app17.toconline.pt').trim();

    if (!clientId || !clientSecret) {
      return res.status(500).json({ success: false, error: 'Missing TOC_CLIENT_ID or TOC_CLIENT_SECRET in environment variables.' });
    }

    // Ler tokens do Supabase
    let access_token = (await getSetting(supabase, 'TOC_ACCESS_TOKEN')).trim();
    let refreshToken  = (await getSetting(supabase, 'TOC_REFRESH_TOKEN')).trim();
    if (!refreshToken) refreshToken = (process.env.TOC_REFRESH_TOKEN || '').trim();
    if (!refreshToken) return res.status(500).json({ success: false, error: 'TOC_REFRESH_TOKEN not found.' });

    // Testar access token
    let testOk = false;
    if (access_token) {
      const testRes = await fetch(`${apiUrl}/api/v1/commercial_sales_documents?limit=1`, {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' }
      });
      testOk = testRes.ok;
    }

    // Refrescar se necessário
    if (!testOk) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${authUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret })
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return res.status(500).json({ success: false, error: `Failed to refresh TOConline token: ${errText}` });
      }
      const tokenData = await tokenRes.json();
      access_token = tokenData.access_token;
      await setSetting(supabase, 'TOC_ACCESS_TOKEN', access_token);
      if (tokenData.refresh_token) await setSetting(supabase, 'TOC_REFRESH_TOKEN', tokenData.refresh_token);
    }

    // Buscar clientes
    const { data: clients, error: clientsErr } = await supabase
      .from('clientes').select('id, nif, name, avenca_automatica');
    if (clientsErr) throw clientsErr;
    const nifMap = new Map(clients.map((c: any) => [c.nif?.trim(), c]));

    // Buscar documentos TOConline
    const docsRes = await fetch(`${apiUrl}/api/v1/commercial_sales_documents`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' }
    });
    if (!docsRes.ok) throw new Error(`TOConline docs error: ${docsRes.status}`);
    const tocDocs = await docsRes.json();

    // Mapear movimentos
    const movements = tocDocs
      .filter((doc: any) => {
        if (doc.date < '2026-01-01') return false;
        const nif = doc.customer_tax_registration_number?.trim();
        const client: any = nifMap.get(nif);
        if (!client) return false;
        const isAvenca = doc.document_no?.includes('AV') || doc.customer_business_name?.toLowerCase().includes('avenca');
        if (isAvenca && client.avenca_automatica !== false) return false;
        return true;
      })
      .map((doc: any) => {
        const nif = doc.customer_tax_registration_number?.trim();
        const client: any = nifMap.get(nif);
        const tipo = doc.document_type?.match(/RE|RC/) ? 'pagamento' : 'fatura';
        let valor = parseFloat(doc.gross_total);
        if (tipo === 'pagamento') valor = -valor;
        return {
          client_id: client.id,
          toconline_id: doc.id.toString(),
          tipo,
          data: doc.date,
          descricao: `${doc.document_no} - ${doc.customer_business_name}`,
          valor,
          pdf_link: doc.public_link
        };
      });

    // Upsert
    if (movements.length > 0) {
      const { error: upsertErr } = await supabase
        .from('movimentos_faturacao')
        .upsert(movements, { onConflict: 'toconline_id' });
      if (upsertErr) throw upsertErr;
    }

    return res.status(200).json({ success: true, count: movements.length });

  } catch (error: any) {
    console.error('Sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
