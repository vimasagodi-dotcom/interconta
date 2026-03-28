const fs = require('fs');

const envFile = fs.readFileSync('c:\\Users\\Utilizador\\Desktop\\ANTIGRAVITY AI\\office-owl-assist-main\\.env', 'utf-8');
const lines = envFile.split('\n');

let url = '';
let key = '';

for (const line of lines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim();
}

async function run() {
  const payload = {
    email: "vimasagodi@gmail.com",
    password: "Interconta2026*",
    email_confirm: true,
    user_metadata: { name: "Vitor Manuel dos Santos Gomes Dias", role: "colaborador" }
  };

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
  
  console.log("User in Auth created:", data.id);

  // Instanciar na tabela 'colaboradores'
  const colabPayload = {
    id: data.id,
    name: "Vitor Manuel dos Santos Gomes Dias",
    email: "vimasagodi@gmail.com",
    phone: "968070090",
    role: "colaborador",
    status: "ativo"
  };

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
    return;
  }
  console.log("Colaborador in Table created:", data2[0].id);
}
run();
