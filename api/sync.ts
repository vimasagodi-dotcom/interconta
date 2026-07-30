import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

// Helper: ler token do Supabase app_settings
async function getSetting(supabase: any, key: string): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
  return data?.value || '';
}

// Helper: gravar token novo no Supabase app_settings
async function setSetting(supabase: any, key: string, value: string) {
  await supabase.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export default async function handler(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    // @ts-ignore
    const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Credentials — lidos do Supabase app_settings (auto-rotating)
    // @ts-ignore
    const clientId     = process.env.TOC_CLIENT_ID?.replace(/[\r\n"']/g, '').trim();
    // @ts-ignore
    const clientSecret = process.env.TOC_CLIENT_SECRET?.replace(/[\r\n"']/g, '').trim();
    const authUrl = process.env.TOC_AUTH_URL?.replace(/[\r\n"']/g, '').trim() || 'https://app17.toconline.pt/oauth';
    const apiUrl  = process.env.TOC_API_URL?.replace(/[\r\n"']/g, '').trim()  || 'https://api17.toconline.pt';

    if (!clientId || !clientSecret) {
      throw new Error('Missing TOC_CLIENT_ID or TOC_CLIENT_SECRET in environment variables.');
    }

    // 2. Ler refresh token do Supabase (em vez do .env)
    let refreshToken = await getSetting(supabase, 'TOC_REFRESH_TOKEN');
    if (refreshToken) refreshToken = refreshToken.trim();
    if (!refreshToken) {
      // Fallback para env var na primeira execução
      // @ts-ignore
      refreshToken = process.env.TOC_REFRESH_TOKEN?.replace(/[\r\n"']/g, '').trim() || '';
    }
    if (!refreshToken) throw new Error('TOC_REFRESH_TOKEN not found in app_settings or env vars.');

    // 3. Usar access token em cache se disponível, senão refreshar
    let access_token = await getSetting(supabase, 'TOC_ACCESS_TOKEN');

    // Tentar com o access token existente; se falhar (401), refreshar
    const testRes = await fetch(`${apiUrl}/api/v1/commercial_sales_documents?limit=1`, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });

    if (!testRes.ok && testRes.status === 401 || !access_token) {
      console.log('Access token inválido ou expirado, a refrescar...');
      
      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      let tokenRes = await fetch(`${authUrl}/token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId || '',
          client_secret: clientSecret || '',
        })
      });

      // Fallback: se o refresh token do Supabase falhar, tenta o do .env
      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        const envRefreshToken = process.env.TOC_REFRESH_TOKEN?.replace(/[\r\n"']/g, '').trim();
        
        if (envRefreshToken && envRefreshToken !== refreshToken) {
          console.log('Refresh token da DB falhou. A tentar o token do .env como fallback...');
          tokenRes = await fetch(`${authUrl}/token`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${basicAuth}`
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: envRefreshToken,
              client_id: clientId || '',
              client_secret: clientSecret || '',
            })
          });
        }
      }

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        const isAuthError = errorText.includes("unauthorized_client");
        const helpMsg = isAuthError 
          ? ". Erro crítico: Refresh Token expirado ou revogado. Pede ao Gemini para realizar a 'Auto-Recuperação' usando o Browser Agent."
          : "";
        throw new Error(`Failed to refresh TOConline token: ${errorText}${helpMsg}`);
      }

      const tokenData = await tokenRes.json();
      access_token = tokenData.access_token;
      const new_refresh = tokenData.refresh_token;

      // Guardar novos tokens no Supabase para próxima execução
      await setSetting(supabase, 'TOC_ACCESS_TOKEN',  access_token);
      if (new_refresh) await setSetting(supabase, 'TOC_REFRESH_TOKEN', new_refresh);
      console.log('Tokens renovados e guardados no Supabase.');
    }

    // 3. Fetch Clients
    const { data: clients, error: clientsErr } = await supabase
      .from('clientes')
      .select('id, nif, name, avenca_automatica');
    
    if (clientsErr) throw clientsErr;
    const nifMap = new Map(clients.map((c: any) => [c.nif?.trim(), c]));

    // 4. Fetch TOConline Documents (reutilizar o token já validado)
    console.log('Fetching documents from TOConline...');
    const docsRes = (testRes.ok)
      ? testRes  // reutilizar a resposta do probe se foi bem sucedido
      : await fetch(`${apiUrl}/api/v1/commercial_sales_documents`, {
          headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
        });

    if (!docsRes.ok) throw new Error(`Failed to fetch documents from TOConline: ${docsRes.status}`);
    const tocDocs = await docsRes.json();

    // 5. Map and Filter
    const movements = tocDocs
      .filter((doc: any) => {
        // Only 2026 onwards
        if (doc.date < '2026-01-01') return false;

        const nif = doc.customer_tax_registration_number?.trim();
        const client: any = nifMap.get(nif);
        if (!client) return false;

        // SKIP Avenças if auto-launch is enabled
        const isTocAvenca = doc.document_no?.includes('AV') || 
                            doc.customer_business_name?.toLowerCase().includes('avença') ||
                            (doc.document_type === 'FT' && doc.gross_total > 0 && doc.document_no.includes('/A'));
        
        if (isTocAvenca && client.avenca_automatica !== false) return false;

        return true;
      })
      .map((doc: any) => {
        const nif = doc.customer_tax_registration_number?.trim();
        const client: any = nifMap.get(nif);
        const type = doc.document_type?.match(/RE|RC/) ? 'pagamento' : 'fatura';
        let value = parseFloat(doc.gross_total);
        if (type === 'pagamento') value = -value;

        return {
          client_id: client.id,
          toconline_id: doc.id.toString(),
          tipo: type,
          data: doc.date,
          descricao: `${doc.document_no} - ${doc.customer_business_name}`,
          valor: value,
          pdf_link: doc.public_link
        };
      });

    // 6. Upsert
    if (movements.length > 0) {
      const { error: upsertErr } = await supabase
        .from('movimentos_faturacao')
        .upsert(movements, { onConflict: 'toconline_id' });
      
      if (upsertErr) throw upsertErr;
    }

    return new Response(
      JSON.stringify({ success: true, count: movements.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
