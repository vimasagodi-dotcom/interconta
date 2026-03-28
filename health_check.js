const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('c:\\Users\\Utilizador\\Desktop\\ANTIGRAVITY AI\\office-owl-assist-main\\.env', 'utf-8');
const lines = envFile.split('\n');

let url = '';
let key = '';

for (const line of lines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim();
}

const supabase = createClient(url, key);

async function test() {
  const tables = ['clientes', 'colaboradores', 'tarefas', 'lancamentos', 'ferias', 'documentos'];
  console.log("A verificar base de dados...");
  
  let allOk = true;
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`[ERRO] Tabela '${table}': ${error.message} - VERIFICAR SE FOI CRIADA!`);
      allOk = false;
    } else {
      console.log(`[OK] Tabela '${table}' acedida com sucesso!`);
    }
  }

  // Verify bucket
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.log(`[ERRO] Storage: ${bucketError.message}`);
    allOk = false;
  } else {
    const docBucket = buckets.find(b => b.name === 'documentos');
    if (docBucket) {
      console.log(`[OK] Bucket 'documentos' encontrado! Public: ${docBucket.public}`);
      if (!docBucket.public) {
         console.log(`[AVISO] O bucket 'documentos' não é público! Precisa de alterar para Public nas defs.`);
         allOk = false;
      }
    } else {
      console.log(`[ERRO] Bucket 'documentos' NÃO FOI ENCONTRADO!`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log("DIAGNOSTICO_COMPLETO_SUCESSO");
  }
}

test();
