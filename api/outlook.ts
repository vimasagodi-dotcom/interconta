import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const MS_USER_EMAIL = 'intercontageral@outlook.pt';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const REDIRECT_URI = 'https://interconta.vercel.app/correio';
const SCOPES = 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite';

// Helper: ler token do Supabase app_settings
async function getSetting(supabase: any, key: string): Promise<string> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
  return data?.value || '';
}

// Helper: gravar token novo no Supabase app_settings
async function setSetting(supabase: any, key: string, value: string) {
  await supabase.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export default async function handler(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
    const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

    if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) {
      throw new Error('MS_CLIENT_ID or MS_CLIENT_SECRET not configured.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(req.url);

    // --- CASE 1: EXCHANGE CODE FOR TOKENS (CALLBACK) ---
    const code = searchParams.get('code');
    if (code && req.method === 'GET') {
      const tokenRes = await fetch(MS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`Token Exchange Error: ${JSON.stringify(tokenData)}`);

      await setSetting(supabase, 'OUTLOOK_ACCESS_TOKEN', tokenData.access_token);
      if (tokenData.refresh_token) {
        await setSetting(supabase, 'OUTLOOK_REFRESH_TOKEN', tokenData.refresh_token);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- CASE 2: NORMAL OPERATIONS (Use Stored Tokens) ---
    
    // Get Refresh Token
    let refreshToken = await getSetting(supabase, 'OUTLOOK_REFRESH_TOKEN');
    if (!refreshToken) {
      return new Response(JSON.stringify({ needs_auth: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or Refresh Access Token
    let accessToken = await getSetting(supabase, 'OUTLOOK_ACCESS_TOKEN');
    
    // Try a simple probe to see if access token is still valid
    const probe = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!probe.ok || !accessToken) {
      console.log('Refreshing Outlook token...');
      const refreshRes = await fetch(MS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: SCOPES,
        }),
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) {
        // If refresh fails, it might be revoked
        return new Response(JSON.stringify({ needs_auth: true, error: 'refresh_failed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      accessToken = refreshData.access_token;
      await setSetting(supabase, 'OUTLOOK_ACCESS_TOKEN', accessToken);
      if (refreshData.refresh_token) {
        await setSetting(supabase, 'OUTLOOK_REFRESH_TOKEN', refreshData.refresh_token);
      }
    }

    const graphBaseUrl = 'https://graph.microsoft.com/v1.0/me';

    // --- GET: List or Single Message or Attachments ---
    if (req.method === 'GET') {
      const messageId = searchParams.get('id');
      const getAttachments = searchParams.get('attachments');
      
      if (messageId && getAttachments === 'true') {
        const res = await fetch(`${graphBaseUrl}/messages/${messageId}/attachments`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else if (messageId) {
        const res = await fetch(`${graphBaseUrl}/messages/${messageId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const folder = searchParams.get('folder') || 'inbox';
        const top = searchParams.get('top') || '30';
        const res = await fetch(`${graphBaseUrl}/mailFolders/${folder}/messages?$top=${top}&$select=id,subject,receivedDateTime,from,isRead,bodyPreview&$orderby=receivedDateTime desc`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // --- POST: Reply to Message (with Attachment Support) ---
    if (req.method === 'POST') {
      const body = await req.json();
      const { messageId, comment, attachments } = body;

      if (!messageId || !comment) throw new Error('Missing messageId or comment');

      // 1. Create Draft Reply
      const createReplyRes = await fetch(`${graphBaseUrl}/messages/${messageId}/createReply`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ comment })
      });

      if (!createReplyRes.ok) throw new Error(`Draft Creation Failed: ${await createReplyRes.text()}`);
      const draft = await createReplyRes.json();
      const draftId = draft.id;

      // 2. Add Attachments (if any)
      if (attachments && Array.isArray(attachments)) {
        for (const file of attachments) {
          const attachRes = await fetch(`${graphBaseUrl}/messages/${draftId}/attachments`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              "@odata.type": "#microsoft.graph.fileAttachment",
              "name": file.name,
              "contentBytes": file.base64
            })
          });
          if (!attachRes.ok) {
            console.error(`Attachment failed for ${file.name}: ${await attachRes.text()}`);
          }
        }
      }

      // 3. Send Draft
      const sendRes = await fetch(`${graphBaseUrl}/messages/${draftId}/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!sendRes.ok) throw new Error(`Send Failed: ${await sendRes.text()}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // --- DELETE: Move to Trash ---
    if (req.method === 'DELETE') {
      const messageId = searchParams.get('id');
      if (!messageId) throw new Error('Missing message ID');

      const res = await fetch(`${graphBaseUrl}/messages/${messageId}/move`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          destinationId: 'deleteditems'
        })
      });

      if (!res.ok) throw new Error(`Move to trash failed: ${await res.text()}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }



    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
