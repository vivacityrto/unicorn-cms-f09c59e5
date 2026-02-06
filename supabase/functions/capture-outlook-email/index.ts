import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  message_id: string;
  client_id?: string;
  package_id?: string;
  task_id?: string;
  tenant_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Processing email capture for user:", userId);

    const payload: EmailPayload = await req.json();
    const { message_id, client_id, package_id, task_id, tenant_id } = payload;

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: "message_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate
    const { data: existingEmail } = await supabase
      .from("email_messages")
      .select("id")
      .eq("user_uuid", userId)
      .eq("external_message_id", message_id)
      .single();

    if (existingEmail) {
      return new Response(
        JSON.stringify({ error: "Email already linked", email_id: existingEmail.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Microsoft access token for this user
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenData, error: tokenError } = await serviceClient
      .from("oauth_tokens")
      .select("access_token, expires_at")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .single();

    if (tokenError || !tokenData) {
      console.error("No Microsoft token found:", tokenError);
      return new Response(
        JSON.stringify({ error: "Microsoft account not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Microsoft token expired. Please reconnect your Outlook account." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch email from Microsoft Graph
    console.log("Fetching email from Microsoft Graph:", message_id);
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${message_id}?$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error("Graph API error:", graphResponse.status, errorText);
      
      if (graphResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: "Email not found in your mailbox" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to fetch email from Outlook" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailData = await graphResponse.json();
    console.log("Email fetched successfully:", emailData.subject);

    // Insert email record
    const { data: emailRecord, error: insertError } = await supabase
      .from("email_messages")
      .insert({
        user_uuid: userId,
        tenant_id: parseInt(tenant_id),
        provider: "microsoft",
        external_message_id: message_id,
        subject: emailData.subject,
        sender_email: emailData.from?.emailAddress?.address,
        sender_name: emailData.from?.emailAddress?.name,
        received_at: emailData.receivedDateTime,
        has_attachments: emailData.hasAttachments || false,
        body_preview: emailData.bodyPreview?.substring(0, 500),
        client_id: client_id ? parseInt(client_id) : null,
        package_id: package_id ? parseInt(package_id) : null,
        task_id: task_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save email record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email record created:", emailRecord.id);

    // Handle attachments if present
    if (emailData.hasAttachments) {
      console.log("Fetching attachments...");
      const attachmentsResponse = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${message_id}/attachments`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (attachmentsResponse.ok) {
        const attachmentsData = await attachmentsResponse.json();
        
        for (const attachment of attachmentsData.value || []) {
          if (attachment["@odata.type"] === "#microsoft.graph.fileAttachment" && attachment.contentBytes) {
            try {
              // Decode base64 content
              const binaryString = atob(attachment.contentBytes);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              // Upload to storage
              const storagePath = `emails/${tenant_id}/${userId}/${emailRecord.id}/${attachment.name}`;
              
              const { error: uploadError } = await serviceClient.storage
                .from("email-attachments")
                .upload(storagePath, bytes, {
                  contentType: attachment.contentType || "application/octet-stream",
                  upsert: false,
                });

              if (uploadError) {
                console.error("Attachment upload error:", uploadError);
                continue;
              }

              // Insert attachment record
              await supabase.from("email_message_attachments").insert({
                email_message_id: emailRecord.id,
                file_name: attachment.name,
                mime_type: attachment.contentType,
                file_size: attachment.size,
                storage_path: storagePath,
              });

              console.log("Attachment saved:", attachment.name);
            } catch (attachError) {
              console.error("Error processing attachment:", attachError);
            }
          }
        }
      }
    }

    // Create audit log entry
    const linkedType = client_id ? "client" : package_id ? "package" : task_id ? "task" : null;
    const linkedId = client_id || package_id || task_id || null;

    await supabase.from("email_link_audit").insert({
      action: "email_linked",
      user_uuid: userId,
      email_message_id: emailRecord.id,
      linked_entity_type: linkedType,
      linked_entity_id: linkedId,
      metadata: {
        subject: emailData.subject,
        sender: emailData.from?.emailAddress?.address,
      },
    });

    console.log("Audit log created");

    return new Response(
      JSON.stringify({
        success: true,
        email: {
          id: emailRecord.id,
          subject: emailRecord.subject,
          sender_email: emailRecord.sender_email,
          sender_name: emailRecord.sender_name,
          received_at: emailRecord.received_at,
          has_attachments: emailRecord.has_attachments,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
