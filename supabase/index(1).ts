import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID") || "f28a2a71-181a-4d33-a62c-02d1f7b5c6b9";
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") || "ac44eee1-4825-4c58-bce0-91f94b1864f1";
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET");
const MS_USER_EMAIL = "intercontageral@outlook.pt";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!MS_CLIENT_SECRET) {
      throw new Error("MS_CLIENT_SECRET not configured in Supabase Secrets");
    }

    const { pathname, searchParams } = new URL(req.url);

    // 1. Get Access Token from Microsoft Graph
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        scope: "https://graph.microsoft.com/.default",
        client_secret: MS_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(`Token Error: ${JSON.stringify(tokenData)}`);
    }
    const accessToken = tokenData.access_token;

    // 2. Handle specific Graph operations
    const graphBaseUrl = `https://graph.microsoft.com/v1.0/users/${MS_USER_EMAIL}`;

    // LIST MESSAGES (GET /)
    if (req.method === "GET") {
      const messageId = searchParams.get("id");
      
      if (messageId) {
        // Get single message detail
        const response = await fetch(`${graphBaseUrl}/messages/${messageId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // List Inbox
        const top = searchParams.get("top") || "20";
        const response = await fetch(`${graphBaseUrl}/mailFolders/inbox/messages?$top=${top}&$select=id,subject,receivedDateTime,from,isRead,bodyPreview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // REPLY TO MESSAGE (POST /)
    if (req.method === "POST") {
      const body = await req.json();
      const messageId = body.messageId;
      const comment = body.comment;

      if (!messageId || !comment) {
        throw new Error("Missing messageId or comment for reply");
      }

      const response = await fetch(`${graphBaseUrl}/messages/${messageId}/createReply`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Create Reply Error: ${err}`);
      }

      const draft = await response.json();
      const draftId = draft.id;

      // Update draft with content and send
      const sendRes = await fetch(`${graphBaseUrl}/messages/${draftId}`, {
        method: "PATCH",
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          body: {
            contentType: "HTML",
            content: comment + "<br/><br/>" + draft.body.content
          }
        })
      });

      if (!sendRes.ok) throw new Error("Failed to update reply draft");

      // Send the draft
      const finalizeRes = await fetch(`${graphBaseUrl}/messages/${draftId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!finalizeRes.ok) throw new Error("Failed to send reply");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE MESSAGE (DELETE /)
    if (req.method === "DELETE") {
      const messageId = searchParams.get("id");
      if (!messageId) throw new Error("Missing ID to delete");

      const response = await fetch(`${graphBaseUrl}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Delete Error: ${err}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
