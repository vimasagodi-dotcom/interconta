export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(req.url);
    const nif = searchParams.get('nif');
    
    // @ts-ignore
    const apiKey = process.env.VITE_NIF_API_KEY;

    if (!nif) {
      return new Response(JSON.stringify({ error: 'NIF is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any = { success: false, source: null };

    // 1. Tentar NIF.pt se for português (NIFs PT começam com 1, 2, 5, 6, 8, 9)
    if (apiKey && /^[125689]/.test(nif)) {
      try {
        const nifPtUrl = `https://www.nif.pt/api/?json=1&q=${nif}&key=${apiKey}`;
        const response = await fetch(nifPtUrl);
        if (response.ok) {
          const nifData = await response.json();
          if (nifData.success && nifData.records && nifData.records[nif]) {
            const record = nifData.records[nif];
            result = {
              success: true,
              source: 'nif.pt',
              name: record.title,
              address: record.address,
              pc4: record.pc4,
              pc3: record.pc3,
              city: record.city
            };
          }
        }
      } catch (e) {
        console.error("NIF.pt error:", e);
      }
    }

    // 2. Fallback para VIES se não encontrado ou se não for PT
    if (!result.success) {
      try {
        const viesUrl = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
        const viesRes = await fetch(viesUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countryCode: "PT", vatNumber: nif }),
        });

        if (viesRes.ok) {
          const data = await viesRes.json();
          if (data.valid) {
            result = {
              success: true,
              source: 'vies',
              name: data.name,
              address: data.address,
              valid: true
            };
          }
        }
      } catch (e) {
        console.error("VIES error:", e);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
