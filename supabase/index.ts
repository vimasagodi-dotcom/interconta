import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TOC_BASE_URL = "https://app17.toconline.pt"

serve(async (req) => {
  // CORS configuration
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    interface Client {
      id: string;
      nif: string;
      avenca_automatica: boolean;
    }

    // 1. Get TOConline Credentials from Env
    const clientId = Deno.env.get('TOC_CLIENT_ID')
    const clientSecret = Deno.env.get('TOC_CLIENT_SECRET')
    const refreshToken = Deno.env.get('TOC_REFRESH_TOKEN')

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing TOConline credentials in Supabase secrets.")
    }

    // 2. Refresh Token
    console.log("Refreshing TOConline token...")
    const tokenRes = await fetch(`${TOC_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      })
    })

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text()
      throw new Error(`Failed to refresh token: ${errorText}`)
    }

    const { access_token, refresh_token: newRefreshToken } = await tokenRes.json()

    // 3. Fetch Clients from DB
    console.log("Fetching clients from Supabase...")
    const { data: clients, error: clientsErr } = await supabaseClient
      .from('clientes')
      .select('id, nif, avenca_automatica')
    
    if (clientsErr) throw clientsErr
    const clientMap = new Map<string, Client>(clients.map((c: Client) => [c.nif?.trim(), c]))

    // 4. Fetch Documents from TOConline
    console.log("Fetching documents from TOConline...")
    const docsRes = await fetch(`${TOC_BASE_URL}/api/v1/commercial_sales_documents`, {
      headers: { 
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    })

    if (!docsRes.ok) throw new Error("Failed to fetch documents from TOConline")
    const tocDocs = await docsRes.json()

    // 5. Map documents to our schema
    const movements = tocDocs
      .filter((doc: any) => {
        // Only 2026 onwards
        const isCorrectDate = doc.date >= '2026-01-01'
        if (!isCorrectDate) return false

        // Check if NIF matches our clients
        const nif = doc.customer_tax_registration_number?.trim()
        const client = clientMap.get(nif)
        if (!client) return false

        // SKIP "AVENÇAS" from TOConline ONLY IF the client has "Lançar Automaticamente" enabled
        const isTocAvenca = doc.document_no?.includes('AV') || 
                            doc.customer_business_name?.toLowerCase().includes('avença') ||
                            (doc.document_type === 'FT' && doc.gross_total > 0 && doc.document_no.includes('/A'))
        
        if (isTocAvenca && client.avenca_automatica !== false) {
          console.log(`Skipping TOConline Avença for ${client.nif} (Auto-launch enabled): ${doc.document_no}`)
          return false
        }

        return true
      })
      .map((doc: any) => {
        const nif = doc.customer_tax_registration_number?.trim()
        const client = clientMap.get(nif)
        const type = doc.document_type?.match(/RE|RC/) ? 'pagamento' : 'fatura'
        let value = parseFloat(doc.gross_total)
        if (type === 'pagamento') value = -value

        return {
          client_id: client.id,
          toconline_id: doc.id.toString(),
          tipo: type,
          data: doc.date,
          descricao: `${doc.document_no} - ${doc.customer_business_name}`,
          valor: value,
          pdf_link: doc.public_link
        }
      })

    // 6. Upsert to Supabase
    if (movements.length > 0) {
      console.log(`Upserting ${movements.length} movements...`)
      const { error: upsertErr } = await supabaseClient
        .from('movimentos_faturacao')
        .upsert(movements, { onConflict: 'toconline_id' })
      
      if (upsertErr) throw upsertErr
    }

    return new Response(
      JSON.stringify({ success: true, count: movements.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
