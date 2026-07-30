import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  runtime: 'edge',
};

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

    const body = await req.json();
    const { fileBase64, fileName, fileType, clients } = body;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Preparar lista de clientes para a IA
    const clientListString = clients.map((c: any) => `ID: ${c.id} | Nome: ${c.name} | NIF: ${c.nif}`).join('\n');

    const prompt = `Analisa este documento e identifica se ele pertence a um dos clientes da lista abaixo.
Procura pelo Nome do Cliente ou pelo NIF (Número de Identificação Fiscal) de 9 dígitos.

IMPORTANTE: Se encontrares o NIF, ele tem prioridade sobre o nome.

LISTA DE CLIENTES:
${clientListString}

Responde EXCLUSIVAMENTE em formato JSON com a seguinte estrutura:
{
  "matched": boolean,
  "clientId": "string ou null",
  "clientName": "string ou null",
  "confidence": float (0 a 1),
  "reason": "breve explicação (ex: encontrado NIF 123456789)"
}`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: fileBase64,
          mimeType: fileType || "application/pdf"
        }
      },
      { text: prompt }
    ]);

    const responseText = result.response.text();
    // Limpar markdown se houver
    const jsonString = responseText.replace(/```json|```/g, "").trim();
    const analysis = JSON.parse(jsonString);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
