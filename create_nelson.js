const fs = require('fs');
const path = require('path');

const envPath = 'c:\\Users\\Utilizador\\Desktop\\ANTIGRAVITY AI\\office-owl-assist-main\\.env';
const envFile = fs.readFileSync(envPath, 'utf-8');
const lines = envFile.split(/\r?\n/);

let url = '';
let key = '';

for (const line of lines) {
  const [k, v] = line.split('=');
  if (k === 'VITE_SUPABASE_URL') url = v.trim();
  if (k === 'VITE_SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
}

if (!url || !key) {
  console.error("Supabase URL or Service Role Key not found in .env");
  process.exit(1);
}

async function run() {
  const payload = {
    email: "ne_dias@sapo.pt",
    password: "Interconta2026*",
    email_confirm: true,
    user_metadata: { name: "Nelson Jorge dos Santos Gomes Dias", role: "colaborador" }
  };

  console.log("Creating user in Auth...");
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Auth Fail:", data);
    return;
  }
  
  const userId = data.id;
  console.log("User in Auth created:", userId);

  // Instanciar na tabela 'colaboradores'
  const colabPayload = {
    id: userId,
    name: "Nelson Jorge dos Santos Gomes Dias",
    email: "ne_dias@sapo.pt",
    phone: "968638564",
    role: "colaborador",
    status: "ativo"
  };

  console.log("Creating collaborator in table...");
  const res2 = await fetch(`${url}/rest/v1/colaboradores`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(colabPayload)
  });

  const data2 = await res2.json();
  if (!res2.ok) {
    console.error("Table Fail:", data2);
    // If it fails on table insertion but succeeded in auth, you might want to cleanup auth
    return;
  }
  console.log("Colaborador in Table created:", data2[0].id);
  console.log("SUCCESS");
}

run().catch(err => console.error("FATAL ERROR:", err));
