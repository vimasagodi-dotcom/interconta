import { createClient } from '@supabase/supabase-js';

const url = 'https://rzktszngtyfswthgvbsf.supabase.co';
const key = 'sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0'; // SERVICE_ROLE_KEY

const supabase = createClient(url, key);

async function cleanup() {
  console.log("Cleaning up all movements before 2026...");
  const { data, error, count } = await supabase
    .from('movimentos_faturacao')
    .delete({ count: 'exact' })
    .lt('data', '2026-01-01');

  if (error) {
    console.error("Error deleting:", error);
  } else {
    console.log(`Successfully deleted ${count} movements before 2026.`);
  }
}

cleanup();
