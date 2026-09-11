// Vercel Serverless Function: Autenticação e Extração Direta e Real do e-Fatura (AT)
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

  const { nif, password, subutilizador, tipo, dataInicio, dataFim, validateOnly } = req.body || {};

  if (!nif || !password) {
    return res.status(400).json({
      success: false,
      error: 'NIF e Senha de Acesso das Finanças são obrigatórios.',
    });
  }

  let cleanNif = String(nif).replace(/\s+/g, '').trim();
  let cleanSub = subutilizador ? String(subutilizador).trim() : '';
  if (cleanNif.includes('/')) {
    const parts = cleanNif.split('/');
    cleanNif = parts[0];
    if (!cleanSub && parts[1]) cleanSub = parts[1];
  }

  const username = cleanSub ? `${cleanNif}/${cleanSub}` : cleanNif;
  const targetTipo = tipo === 'vendas' ? 'vendas' : 'compras';
  const actionName = targetTipo === 'vendas' ? 'consultarDocumentosEmitente.action' : 'consultarDocumentosAdquirente.action';

  try {
    // IMPORTANTE: Manter cookies rigorosamente isolados por domínio para não corromper tokens SSO
    const faturasCookies = new Map<string, string>();
    const acessoCookies = new Map<string, string>();

    const saveCookies = (jar: Map<string, string>, headers: any) => {
      let raw: string[] = [];
      if (typeof headers.getSetCookie === 'function') {
        raw = headers.getSetCookie();
      } else {
        const rawHeader = headers.get('set-cookie');
        if (rawHeader) {
          raw = rawHeader.split(/,(?=[^;]+=[^;]+)/);
        }
      }

      for (const p of raw || []) {
        if (!p) continue;
        const pair = p.split(';')[0].trim();
        const eq = pair.indexOf('=');
        if (eq > 0) {
          jar.set(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
        }
      }
    };

    const getCookieHeader = (jar: Map<string, string>) => {
      return Array.from(jar.entries())
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
    saveCookies(faturasCookies, initRes.headers);

    const redirectUrl = initRes.headers.get('location') || `https://www.acesso.gov.pt/jsp/loginRedirectForm.jsp?path=${actionName}&partID=EFPF`;

    // 2. Aceder ao formulário de autenticação do acesso.gov.pt
    const formRes = await fetch(redirectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': getCookieHeader(acessoCookies),
      },
      redirect: 'manual',
    });
    saveCookies(acessoCookies, formRes.headers);
    const formHtml = await formRes.text();

    // Extrair atributos e token CSRF
    const csrfMatch = formHtml.match(/token:\s*[`'"]([^`'"]+)[`'"]/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    if (!csrfToken) {
      return res.status(500).json({
        success: false,
        error: 'Não foi possível inicializar o protocolo de autenticação da AT (Token CSRF ausente).',
      });
    }

    let attributes: Record<string, string> = {
      path: actionName,
      partID: 'EFPF',
    };
    const attrMatch = formHtml.match(/<script id="data-attributes" type="application\/json">([^<]*)<\/script>/);
    if (attrMatch && attrMatch[1]) {
      try {
        attributes = JSON.parse(attrMatch[1]);
      } catch {}
    }

    // 3. Submeter credenciais ao endpoint de autenticação do acesso.gov.pt
    const urlLoginMatch = formHtml.match(/urlLogin:\s*stringOrNull\(['"]([^'"]+)['"]\)/);
    const urlLoginRel = urlLoginMatch ? urlLoginMatch[1] : 'submissaoFormularioLogin';
    const postUrl = new URL(urlLoginRel, redirectUrl).toString();

    const postBody = new URLSearchParams();
    for (const [k, v] of Object.entries(attributes)) {
      postBody.append(k, String(v));
    }
    postBody.append('selectedAuthMethod', 'N');
    postBody.append('_csrf', csrfToken);
    postBody.append('authVersion', '1');
    postBody.append('username', username);
    postBody.append('password', String(password).trim());

    const loginRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': redirectUrl,
        'Origin': 'https://www.acesso.gov.pt',
        'Cookie': getCookieHeader(acessoCookies),
      },
      body: postBody.toString(),
      redirect: 'manual',
    });
    saveCookies(acessoCookies, loginRes.headers);

    const loginHtml = await loginRes.text();

    // Se NÃO tem forwardParticipantForm, o login falhou na AT
    if (!loginHtml.includes('forwardParticipantForm')) {
      const errMatch = loginHtml.match(/id="data-field-error"[^>]*>([^<]+)</);
      let errMsg = 'Palavra-passe ou NIF incorreto na Autoridade Tributária.';
      if (errMatch && errMatch[1] && errMatch[1].trim()) {
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

    // 4. Tratar auto-submissão do forwardParticipantForm para o faturas.portaldasfinancas.gov.pt
    let companyName = '';
    const formTagMatch = loginHtml.match(/<form[^>]+id="forwardParticipantForm"[^>]*action="([^"]+)"/i);
    const forwardUrl = formTagMatch ? formTagMatch[1] : '';

      const inputMatches = [...loginHtml.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)];
      const forwardParams: string[] = [];
      for (const m of inputMatches) {
        if (m[1] === 'userName') {
          companyName = m[2].trim();
        }
        forwardParams.push(`${encodeURIComponent(m[1])}=${encodeURIComponent(m[2])}`);
      }

      if (forwardUrl) {
        const forwardRes = await fetch(forwardUrl, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': postUrl,
            'Origin': 'https://www.acesso.gov.pt',
            'Cookie': getCookieHeader(faturasCookies),
          },
          body: forwardParams.join('&'),
          redirect: 'manual',
        });
        saveCookies(faturasCookies, forwardRes.headers);

        let fwdRedirect = forwardRes.headers.get('location');
        let fwdCount = 0;
        while (fwdRedirect && fwdCount < 5) {
          fwdCount++;
          const nextUrl = new URL(fwdRedirect, forwardUrl).toString();
          const targetJar = nextUrl.includes('acesso.gov.pt') ? acessoCookies : faturasCookies;
          const nextRes = await fetch(nextUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cookie': getCookieHeader(targetJar),
            },
            redirect: 'manual',
          });
          saveCookies(targetJar, nextRes.headers);
          fwdRedirect = nextRes.headers.get('location');
        }
      }

    if (validateOnly) {
      return res.status(200).json({
        success: true,
        companyName,
        message: `Sessão e-Fatura validada com sucesso na AT (${companyName || cleanNif})!`,
      });
    }

    // 5. Obter Totais Mensais Oficiais da AT (revela todas as faturas e totais por mês, sem limite de 300)
    const startDate = new Date(dataInicio || `${new Date().getFullYear()}-01-01`);
    const endDate = new Date(dataFim || `${new Date().getFullYear()}-12-31`);

    let totaisMensais: Array<{ mes: string; numFaturas: number; baseTributavel: number; valorIva: number; total: number }> = [];
    const targetYear = startDate.getFullYear() || new Date().getFullYear();

    if (targetTipo === 'vendas') {
      try {
        const totaisRes = await fetch(`https://faturas.portaldasfinancas.gov.pt/json/obterTotaisMensaisFaturaEmitente.action?anoFilter=${targetYear}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://faturas.portaldasfinancas.gov.pt/consultarTotaisMensaisFaturaEmitente.action',
            'Cookie': getCookieHeader(faturasCookies),
          },
        });
        if (totaisRes.ok) {
          const tData = await totaisRes.json();
          if (tData?.success && Array.isArray(tData.linhas)) {
            totaisMensais = tData.linhas.map((row: any) => {
              const valTotal = (row.valorTotal || 0) / 100;
              const valIva = (row.valorIva || 0) / 100;
              const valBase = Math.round((valTotal - valIva) * 100) / 100;
              return {
                mes: `${targetYear}-${row.mes}`,
                numFaturas: row.ndocumentos || 0,
                baseTributavel: valBase,
                valorIva: Math.round(valIva * 100) / 100,
                total: Math.round(valTotal * 100) / 100,
              };
            }).sort((a: any, b: any) => a.mes.localeCompare(b.mes));
          }
        }
      } catch (e) {
        console.warn('Erro ao obter totais mensais emitente:', e);
      }
    }

    // 6. Dividir o período em lotes dinâmicos para maximizar o número de faturas individuais
    // Como a AT impõe teto de 300 documentos por pedido, fatiar em intervalos menores permite recolher muito mais documentos.
    const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    let sliceStepDays = 7;
    if (totalDays <= 31) {
      sliceStepDays = 1; // Período de 1 mês: dia a dia para recolher o máximo absoluto de documentos sem teto
    } else if (totalDays <= 93) {
      sliceStepDays = 4; // Período de 1 trimestre: lotes de 4 dias
    } else {
      sliceStepDays = 14; // Período anual: lotes de 14 dias
    }

    const intervals: Array<{ start: string; end: string }> = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const batchEnd = new Date(cur);
      batchEnd.setDate(batchEnd.getDate() + (sliceStepDays - 1));
      const actualEnd = batchEnd > endDate ? new Date(endDate) : batchEnd;

      intervals.push({
        start: cur.toISOString().split('T')[0],
        end: actualEnd.toISOString().split('T')[0],
      });

      cur.setDate(cur.getDate() + sliceStepDays);
    }

    // 6. Consultar endpoint JSON real da AT
    const allInvoices: any[] = [];
    const seenDocs = new Set<string>();

    const decodeEntities = (str: string) => {
      if (!str) return '';
      return str
        .replace(/&atilde;/gi, 'ã')
        .replace(/&otilde;/gi, 'õ')
        .replace(/&ccedil;/gi, 'ç')
        .replace(/&eacute;/gi, 'é')
        .replace(/&aacute;/gi, 'á')
        .replace(/&iacute;/gi, 'í')
        .replace(/&oacute;/gi, 'ó')
        .replace(/&uacute;/gi, 'ú')
        .replace(/&acirc;/gi, 'â')
        .replace(/&ecirc;/gi, 'ê')
        .replace(/&ocirc;/gi, 'ô')
        .replace(/&agrave;/gi, 'à')
        .replace(/&Acirc;/gi, 'Â')
        .replace(/&Ecirc;/gi, 'Ê')
        .replace(/&Ccedil;/gi, 'Ç')
        .replace(/&amp;/gi, '&');
    };

    const classesToQuery = targetTipo === 'vendas' ? ['SI', 'PY'] : [''];

    for (const interval of intervals) {
      for (const cls of classesToQuery) {
        let jsonEndpoint = '';
        if (targetTipo === 'vendas') {
          const q = new URLSearchParams({
            classeDocumentoFilter: cls,
            dataInicioFilter: interval.start,
            dataFimFilter: interval.end,
            semRecibosVerdesFilter: 'N',
          });
          jsonEndpoint = `https://faturas.portaldasfinancas.gov.pt/json/obterDocumentosEmitente.action?${q.toString()}`;
        } else {
          const q = new URLSearchParams({
            dataInicioFilter: interval.start,
            dataFimFilter: interval.end,
          });
          jsonEndpoint = `https://faturas.portaldasfinancas.gov.pt/json/obterDocumentosAdquirente.action?${q.toString()}`;
        }

        try {
          const atRes = await fetch(jsonEndpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': `https://faturas.portaldasfinancas.gov.pt/${actionName}`,
              'Cookie': getCookieHeader(faturasCookies),
            },
          });

          if (!atRes.ok) continue;

          const atData = await atRes.json();
          const linhas = atData?.linhas || [];

          for (const item of linhas) {
            const docId = String(item.idDocumento || item.numerodocumento || Math.random());
            if (seenDocs.has(docId)) continue;
            seenDocs.add(docId);

            // A AT devolve valores monetários inteiros em cêntimos (ex: 36000 cêntimos = 360.00 €)
            const rawBase = typeof item.valorTotalBaseTributavel === 'number'
              ? item.valorTotalBaseTributavel
              : parseFloat(item.valorTotalBaseTributavel || 0);

            const rawIva = typeof item.valorTotalIva === 'number'
              ? item.valorTotalIva
              : parseFloat(item.valorTotalIva || 0);

            const rawTotal = typeof item.valorTotal === 'number'
              ? item.valorTotal
              : parseFloat(item.valorTotal || 0);

            const baseTributavel = Math.round((rawBase / 100) * 100) / 100;
            const valorIva = Math.round((rawIva / 100) * 100) / 100;
            const total = Math.round((rawTotal / 100) * 100) / 100;

            // Taxa de IVA aproximada calculada
            let taxaIva = '23%';
            if (baseTributavel > 0) {
              const ratio = valorIva / baseTributavel;
              if (ratio < 0.04) taxaIva = '0%';
              else if (ratio < 0.09) taxaIva = '6%';
              else if (ratio < 0.18) taxaIva = '13%';
              else taxaIva = '23%';
            } else if (valorIva === 0) {
              taxaIva = 'Isento / 0%';
            }

            if (targetTipo === 'vendas') {
              allInvoices.push({
                nifEmitente: cleanNif,
                nomeEmitente: decodeEntities(companyName || 'Empresa Emitente'),
                nifAdquirente: String(item.nifAdquirente || ''),
                nomeAdquirente: decodeEntities(item.nomeAdquirente || `Cliente NIF ${item.nifAdquirente || 'Final'}`),
                tipoDoc: item.tipoDocumentoDesc || item.tipoDocumento || 'FT',
                numeroDoc: item.numerodocumento || '',
                dataEmissao: item.dataEmissaoDocumento || '',
                dataRegisto: item.dataEmissaoDocumento || '',
                atcud: item.atcud || '',
                baseTributavel,
                taxaIva,
                valorIva,
                total,
                estado: item.estadoBeneficioDescEmitente || item.estadoBeneficioDesc || 'Comunicada',
                setor: item.actividadeEmitenteDesc ? decodeEntities(item.actividadeEmitenteDesc) : 'Vendas / Serviços',
              });
            } else {
              allInvoices.push({
                nifEmitente: String(item.nifEmitente || ''),
                nomeEmitente: decodeEntities(item.nomeEmitente || `Fornecedor NIF ${item.nifEmitente || ''}`),
                nifAdquirente: cleanNif,
                nomeAdquirente: decodeEntities(companyName || `Empresa NIF ${cleanNif}`),
                tipoDoc: item.tipoDocumentoDesc || item.tipoDocumento || 'FT',
                numeroDoc: item.numerodocumento || '',
                dataEmissao: item.dataEmissaoDocumento || '',
                dataRegisto: item.dataEmissaoDocumento || '',
                atcud: item.atcud || '',
                baseTributavel,
                taxaIva,
                valorIva,
                total,
                estado: item.estadoBeneficioDesc || 'Registado',
                setor: item.actividadeEmitenteDesc ? decodeEntities(item.actividadeEmitenteDesc) : 'Geral',
              });
            }
          }
        } catch (intervalErr) {
          console.warn(`Aviso ao extrair intervalo ${interval.start} a ${interval.end}:`, intervalErr);
        }
      }
    }

    // 7. Calcular o resumo oficial certificado da AT para o período selecionado
    let certifiedSummary = null;
    if (totaisMensais.length > 0) {
      const sMonth = (dataInicio || '').substring(0, 7);
      const eMonth = (dataFim || '').substring(0, 7);
      const matchingMonths = totaisMensais.filter(m => m.mes >= sMonth && m.mes <= eMonth);
      if (matchingMonths.length > 0) {
        certifiedSummary = {
          numFaturas: matchingMonths.reduce((s, m) => s + (m.numFaturas || 0), 0),
          baseTributavel: Math.round(matchingMonths.reduce((s, m) => s + (m.baseTributavel || 0), 0) * 100) / 100,
          valorIva: Math.round(matchingMonths.reduce((s, m) => s + (m.valorIva || 0), 0) * 100) / 100,
          total: Math.round(matchingMonths.reduce((s, m) => s + (m.total || 0), 0) * 100) / 100,
          months: matchingMonths,
        };
      }
    }

    return res.status(200).json({
      success: true,
      companyName,
      tipo: targetTipo,
      nif: cleanNif,
      count: allInvoices.length,
      invoices: allInvoices,
      totaisMensais,
      certifiedSummary,
    });
  } catch (error: any) {
    console.error('Erro na extração e-Fatura:', error);
    return res.status(500).json({
      success: false,
      error: `Falha na ligação à Autoridade Tributária: ${error?.message || 'Erro de comunicação.'}`,
    });
  }
}
