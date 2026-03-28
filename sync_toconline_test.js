const fs = require('fs');
const path = require('path');

const envPath = 'c:\\Users\\Utilizador\\Desktop\\ANTIGRAVITY AI\\office-owl-assist-main\\.env';
const envFile = fs.readFileSync(envPath, 'utf-8');
const lines = envFile.split(/\r?\n/);

let url = '';
let key = '';
let tocToken = '';

for (const line of lines) {
  const [k, v] = line.split('=');
  if (k === 'VITE_SUPABASE_URL') url = v.trim();
  if (k === 'VITE_SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
  if (k === 'TOC_ACCESS_TOKEN') tocToken = v.trim();
}

async function run() {
  // 1. Fetch Clients to map NIFs
  console.log("Fetching clients...");
  const resClients = await fetch(`${url}/rest/v1/clientes?select=id,nif,name`, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}` }
  });
  const clients = await resClients.json();
  const nifMap = {};
  clients.forEach(c => { nifMap[c.nif] = c; });

  // 2. Fetch TOConline documents
  console.log("Fetching TOConline documents...");
  const tocUrl = "https://app17.toconline.pt/api/v1/commercial_sales_documents";
  const resToc = await fetch(tocUrl, {
    headers: {
      "Authorization": `Bearer ${tocToken}`,
      "Accept": "application/json"
    }
  });
  
  if (!resToc.ok) {
    console.error("Failed to fetch from TOConline:", await resToc.text());
    return;
  }

  const tocDocs = await resToc.json();
  console.log(`Found ${tocDocs.length} documents.`);

  const movements = [];
  tocDocs.forEach(doc => {
    const client = nifMap[doc.customer_tax_registration_number];
    if (client) {
      movements.push({
        client_id: client.id,
        toconline_id: doc.id.toString(),
        document_no: doc.document_no,
        date: doc.date,
        type: doc.document_type === 'FT' ? 'fatura' : 'pagamento',
        description: `${doc.document_no} - ${doc.customer_business_name}`,
        value: doc.gross_total,
        pdf_link: doc.public_link
      });
    }
  });

  console.log(`Mapped ${movements.length} movements common to our clients.`);
  console.log("Sample movement:", movements[0]);
  
  // 3. Try to push to Supabase (this table might not exist yet!)
  /*
  const resPush = await fetch(`${url}/rest/v1/movimentos_faturacao`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(movements)
  });
  */
}

run();
