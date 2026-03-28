import { createClient } from '@supabase/supabase-js';

const url = 'https://rzktszngtyfswthgvbsf.supabase.co';
const key = 'sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0'; // SERVICE_ROLE_KEY

const supabase = createClient(url, key);

async function addColumn() {
  console.log("Adding 'avenca_automatica' column to 'clientes' table...");
  
  // NOTE: Supabase JS SDK doesn't support 'ALTER TABLE' directly.
  // We usually do this via SQL Editor or a manual migration.
  // However, I can try to trigger it via a RPC if the user has one, 
  // or I can just tell the user to run the SQL.
  // BUT, since I am an agent with a service role, I'll try to use a POST request to the REST API if extensions allow.
  // Actually, the most reliable way for me is to provide the SQL and ask the user, 
  // OR try to use the 'pg' extension if enabled.
  
  // Wait, I can use the 'supabase' CLI locally if installed! 
  // Let's check if 'npx supabase' works.
  
  console.log("Please run this SQL in your Supabase SQL Editor:");
  console.log("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS avenca_automatica BOOLEAN DEFAULT true;");
}

addColumn();
