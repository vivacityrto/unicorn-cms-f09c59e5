import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitTimelineEvent } from "../_shared/emit-timeline-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  action?: "link-email" | "refresh-linked-email-metadata";
  email_id?: string;
  message_id: string;
  client_id?: string;
  package_id?: string;
  task_id?: string;
  tenant_id: string;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(html?: string | null) {
  if (!html) return "";

  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<li>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normalizePreviewText(...parts: Array<string | null | undefined>) {
  const joined = parts
    .map((part) => (part ?? "").replace(/\u00a0/g, " "))
    .join(" ");

  return joined.replace(/\s+/g, " ").trim();
}

function buildPreviewText(emailData: any) {
  return normalizePreviewText(
    htmlToPlainText(emailData?.body?.content),
    emailData?.bodyPreview,
    emailData?.subject
  );
}

async function generateAiSummary({
  previewText,
  subject,
  sender,
}: {
  previewText: string;
  subject?: string | null;
  sender?: string | null;
}) {
  if (previewText.length <= 20) return null;

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content:
            "You are a concise email summariser. Produce a 1-2 sentence summary capturing the key point, any action items, and the tone. No preamble.",
        },
        {
          role: "user",
          content: `Subject: ${subject || "(No subject)"}\nFrom: ${sender || "Unknown"}\nContent: ${previewText.slice(0, 4000)}`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    console.warn("AI summary generation failed:", aiResponse.status);
    return null;
  }

  const aiData = await aiResponse.json();
  return aiData.choices?.[0]?.message?.content?.trim() || null;
}

async function fetchGraphEmail(accessToken: string, messageId: string) {
  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview,body`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!graphResponse.ok) {
    const errorText = await graphResponse.text();
    console.error("Graph API error:", graphResponse.status, errorText);
    throw new Error(graphResponse.status === 404 ? "Email not found in your mailbox" : "Failed to fetch email from Outlook");
  }

  return graphResponse.json();
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
    const { action = "link-email", email_id, message_id, client_id, package_id, task_id, tenant_id } = payload;

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

    if (action === "refresh-linked-email-metadata") {
      if (!email_id) {
        return new Response(
          JSON.stringify({ error: "email_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existingEmail, error: existingEmailError } = await supabase
        .from("email_messages")
        .select("id, user_uuid")
        .eq("id", email_id)
        .single();

      if (existingEmailError || !existingEmail || existingEmail.user_uuid !== userId) {
        return new Response(
          JSON.stringify({ error: "Linked email not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Refreshing linked email metadata:", email_id);
      const emailData = await fetchGraphEmail(tokenData.access_token, message_id);
      const previewText = buildPreviewText(emailData);
      const aiSummary = await generateAiSummary({
        previewText,
        subject: emailData.subject,
        sender: emailData.from?.emailAddress?.name || emailData.from?.emailAddress?.address,
      });

      const { error: updateError } = await serviceClient
        .from("email_messages")
        .update({
          subject: emailData.subject,
          sender_email: emailData.from?.emailAddress?.address,
          sender_name: emailData.from?.emailAddress?.name,
          received_at: emailData.receivedDateTime,
          has_attachments: emailData.hasAttachments || false,
          body_preview: previewText.substring(0, 900) || null,
          ai_summary: aiSummary,
        })
        .eq("id", email_id);

      if (updateError) {
        console.error("Refresh update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to refresh linked email" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, refreshed: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Fetch email from Microsoft Graph
    console.log("Fetching email from Microsoft Graph:", message_id);
    const emailData = await fetchGraphEmail(tokenData.access_token, message_id);
    console.log("Email fetched successfully:", emailData.subject);
    const previewText = buildPreviewText(emailData);

    let aiSummary: string | null = null;
    try {
      aiSummary = await generateAiSummary({
        previewText,
        subject: emailData.subject,
        sender: emailData.from?.emailAddress?.name || emailData.from?.emailAddress?.address,
      });
      if (aiSummary) {
        console.log("AI summary generated");
      }
    } catch (aiErr) {
      console.warn("AI summary error (non-critical):", aiErr);
    }

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
        body_preview: previewText.substring(0, 900) || null,
        ai_summary: aiSummary,
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

    // Emit timeline event: email_linked
    if (tenant_id && emailRecord) {
      await emitTimelineEvent(serviceClient, {
        tenant_id: parseInt(tenant_id),
        client_id: client_id || String(tenant_id),
        event_type: "email_linked",
        title: `Email linked: ${(emailData.subject || "").substring(0, 60)}`,
        source: "microsoft",
        visibility: "internal",
        entity_type: "email_message",
        entity_id: emailRecord.id,
        package_id: package_id ? parseInt(package_id) : null,
        metadata: {
          subject: (emailData.subject || "").substring(0, 100),
          from: emailData.from?.emailAddress?.address,
        },
        created_by: userId as string,
        dedupe_key: `email_link:${emailRecord.id}`,
      });
    }

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
