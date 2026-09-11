// Vercel Serverless Function: Autenticação e Extração Direta do e-Fatura (AT)
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { nif, password, subutilizador, tipo, dataInicio, dataFim } = req.body || {};

  if (!nif || !password) {
    return res.status(400).json({
      success: false,
      error: 'NIF e Senha de Acesso das Finanças são obrigatórios.',
    });
  }

  const targetTipo = tipo === 'vendas' ? 'vendas' : 'compras';
  const actionName = targetTipo === 'vendas' ? 'consultarDocumentosEmitente.action' : 'consultarDocumentosAdquirente.action';
  const csvActionName = targetTipo === 'vendas' ? 'obterDocumentosEmitenteCsv.action' : 'obterDocumentosAdquirenteCsv.action';

  try {
    const cookieJar = new Map<string, string>();

    const saveCookies = (headers: any) => {
      let raw: string[] = [];
      if (typeof headers.getSetCookie === 'function') {
        raw = headers.getSetCookie();
      } else {
        const rawHeader = headers.get('set-cookie');
        if (rawHeader) {
          raw = rawHeader.split(/,(?=[^;]+=[^;]+)/);
        }
      }

      for (const p of raw) {
        const pair = p.split(';')[0].trim();
        const eq = pair.indexOf('=');
        if (eq > 0) {
          const k = pair.substring(0, eq).trim();
          const v = pair.substring(eq + 1).trim();
          cookieJar.set(k, v);
        }
      }
    };

    const getCookieHeader = () => {
      return Array.from(cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    };

    // 1. Pedir URL inicial no faturas.portaldasfinancas.gov.pt para gerar redirecionamento de login
    const initialUrl = `https://faturas.portaldasfinancas.gov.pt/${actionName}`;
    const initRes = await fetch(initialUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
    });
    saveCookies(initRes.headers);

    const redirectUrl = initRes.headers.get('location') || `https://www.acesso.gov.pt/jsp/loginRedirectForm.jsp?path=${actionName}&partID=EFPF`;

    // 2. Aceder ao formulário de autenticação do acesso.gov.pt
    const formRes = await fetch(redirectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': getCookieHeader(),
      },
      redirect: 'manual',
    });
    saveCookies(formRes.headers);
    const formHtml = await formRes.text();

    // Extrair token CSRF
    const csrfMatch = formHtml.match(/token:\s*[`'"]([^`'"]+)[`'"]/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    if (!csrfToken) {
      return res.status(500).json({
        success: false,
        error: 'Não foi possível inicializar o protocolo de autenticação da AT (Token CSRF ausente).',
      });
    }

    // 3. Submeter credenciais ao acesso.gov.pt
    const username = subutilizador ? `${nif}/${subutilizador}` : nif;
    const postBody = new URLSearchParams({
      username: username.trim(),
      password: password,
      _csrf: csrfToken,
      selectedAuthMethod: 'N',
    });

    const loginRes = await fetch('https://www.acesso.gov.pt/v2/login', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': redirectUrl,
        'Cookie': getCookieHeader(),
      },
      body: postBody.toString(),
      redirect: 'manual',
    });
    saveCookies(loginRes.headers);

    // Verificar se houve erro de login
    const loginHtml = await loginRes.text();
    if (loginRes.status === 200 && loginHtml.includes('data-field-error')) {
      const errMatch = loginHtml.match(/id="data-field-error"[^>]*>([^<]+)</);
      let errMsg = 'Palavra-passe ou NIF incorreto na Autoridade Tributária.';
      if (errMatch && errMatch[1]) {
        try {
          const parsedErr = JSON.parse(errMatch[1]);
          if (parsedErr.errorMsg) errMsg = parsedErr.errorMsg;
        } catch {}
      }
      return res.status(401).json({
        success: false,
        error: `Erro de login na AT: ${errMsg}`,
      });
    }

    // Seguir redirecionamentos após login bem-sucedido
    let currentRedirect = loginRes.headers.get('location');
    let redirectCount = 0;
    while (currentRedirect && redirectCount < 5) {
      redirectCount++;
      const nextRes = await fetch(currentRedirect, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': getCookieHeader(),
        },
        redirect: 'manual',
      });
      saveCookies(nextRes.headers);
      currentRedirect = nextRes.headers.get('location');
    }

    // 4. Dividir o período em intervalos semanais (7 dias) para garantir que não ultrapassa o limite de 300 da AT
    const startDate = new Date(dataInicio || `${new Date().getFullYear()}-01-01`);
    const endDate = new Date(dataFim || `${new Date().getFullYear()}-12-31`);

    const intervals: Array<{ start: string; end: string }> = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const batchEnd = new Date(cur);
      batchEnd.setDate(batchEnd.getDate() + 6);
      const actualEnd = batchEnd > endDate ? new Date(endDate) : batchEnd;

      intervals.push({
        start: cur.toISOString().split('T')[0],
        end: actualEnd.toISOString().split('T')[0],
      });

      cur.setDate(cur.getDate() + 7);
    }

    // 5. Extrair CSVs da AT para cada intervalo semanal
    const allInvoices: any[] = [];
    const seenDocs = new Set<string>();

    for (const interval of intervals) {
      const csvUrl = `https://faturas.portaldasfinancas.gov.pt/${csvActionName}?dataInicio=${interval.start}&dataFim=${interval.end}`;
      try {
        const csvRes = await fetch(csvUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': getCookieHeader(),
            'Referer': `https://faturas.portaldasfinancas.gov.pt/${actionName}`,
          },
        });

        if (!csvRes.ok) continue;

        const buffer = await csvRes.arrayBuffer();
        // AT exports CSV in ISO-8859-1 or UTF-8
        let csvText = '';
        try {
          const decoder = new TextDecoder('iso-8859-15');
          csvText = decoder.decode(buffer);
        } catch {
          const decoder = new TextDecoder('utf-8');
          csvText = decoder.decode(buffer);
        }

        // Se retornou página HTML de login em vez de CSV, a sessão não foi aceite
        if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
          continue;
        }

        // Fazer parsing do CSV
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) continue;

        // O cabeçalho é a primeira linha
        const headers = lines[0].split(';').map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';').map((c) => c.replace(/^["']|["']$/g, '').trim());
          if (cols.length < 5) continue;

          // Mapeamento dinâmico baseado nos cabeçalhos da AT
          const rowData: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowData[h] = cols[idx] || '';
          });

          const parseNum = (val: string) => {
            if (!val) return 0;
            const cleaned = val.replace(/\./g, '').replace(',', '.');
            const n = parseFloat(cleaned);
            return isNaN(n) ? 0 : n;
          };

          const docNum = rowData['número documento'] || rowData['numero documento'] || cols[2] || cols[3] || '';
          const atcud = rowData['atcud'] || cols[5] || '';
          const uniqueKey = `${docNum}_${atcud}_${cols[0]}`;

          if (!seenDocs.has(uniqueKey)) {
            seenDocs.add(uniqueKey);

            if (targetTipo === 'vendas') {
              allInvoices.push({
                nifEmitente: nif,
                nomeEmitente: 'Empresa Titular',
                nifAdquirente: rowData['nif adquirente'] || cols[0] || '',
                nomeAdquirente: rowData['nome adquirente'] || cols[1] || '',
                tipoDoc: rowData['tipo documento'] || cols[2] || 'FT',
                numeroDoc: docNum,
                dataEmissao: rowData['data emissão'] || rowData['data emissao'] || cols[4] || '',
                dataRegisto: rowData['data registo'] || cols[4] || '',
                atcud: atcud,
                baseTributavel: parseNum(rowData['base tributável'] || rowData['base tributavel'] || cols[7] || '0'),
                taxaIva: rowData['taxa iva'] || '23%',
                valorIva: parseNum(rowData['total iva'] || cols[8] || '0'),
                total: parseNum(rowData['valor total'] || cols[6] || '0'),
                estado: rowData['estado'] || cols[9] || 'Comunicada',
                setor: 'Vendas e Serviços Prestados',
              });
            } else {
              allInvoices.push({
                nifEmitente: rowData['nif emitente'] || cols[0] || '',
                nomeEmitente: rowData['nome emitente'] || cols[1] || '',
                nifAdquirente: nif,
                nomeAdquirente: 'Empresa Titular',
                tipoDoc: rowData['tipo documento'] || cols[2] || 'FT',
                numeroDoc: docNum,
                dataEmissao: rowData['data emissão'] || rowData['data emissao'] || cols[4] || '',
                dataRegisto: rowData['data registo'] || cols[5] || '',
                atcud: atcud,
                baseTributavel: parseNum(rowData['base tributável'] || rowData['base tributavel'] || cols[8] || '0'),
                taxaIva: rowData['taxa iva'] || '23%',
                valorIva: parseNum(rowData['total iva'] || cols[9] || '0'),
                total: parseNum(rowData['valor total'] || cols[7] || '0'),
                estado: rowData['estado'] || cols[10] || 'Comunicada',
                setor: rowData['setor'] || rowData['setor atividade'] || cols[11] || 'Geral',
              });
            }
          }
        }
      } catch (intervalErr) {
        console.warn(`Aviso no intervalo ${interval.start} a ${interval.end}:`, intervalErr);
      }
    }

    return res.status(200).json({
      success: true,
      count: allInvoices.length,
      invoices: allInvoices,
      tipo: targetTipo,
      nif,
      periodo: { inicio: dataInicio, fim: dataFim },
    });
  } catch (error: any) {
    console.error('Erro na extração AT:', error);
    return res.status(500).json({
      success: false,
      error: `Erro ao conectar e extrair da AT: ${error.message || 'Falha de comunicação'}`,
    });
  }
}
