import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  tenant_id: number;
}

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  file?: {
    mimeType: string;
  };
  parentReference?: {
    driveId: string;
  };
  lastModifiedDateTime?: string;
  eTag?: string;
}

interface LinkDocumentRequest {
  action: 'link' | 'browse-drives' | 'browse-items' | 'search' | 'check-version' | 'confirm-version' | 'link-email-attachments';
  drive_id?: string;
  item_id?: string;
  folder_id?: string;
  search_query?: string;
  client_id?: number;
  package_id?: number;
  process_id?: string;
  task_id?: string;
  meeting_id?: string;
  evidence_type?: string;
  notes?: string;
  document_link_id?: string;
  // For email attachment linking
  external_message_id?: string;
  email_message_id?: string;
  attachment_list?: EmailAttachmentInput[];
}

interface EmailAttachmentInput {
  file_name: string;
  mime_type?: string;
  size?: number;
  source_url?: string;
  provider_item_id?: string;
}

async function refreshTokenIfNeeded(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  token: TokenRecord
): Promise<string> {
  const expiresAt = new Date(token.expires_at);
  const now = new Date();
  
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return token.access_token;
  }

  console.log('[link-sharepoint] Refreshing token for user:', userId);

  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile email offline_access Files.Read Sites.Read.All'
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[link-sharepoint] Token refresh failed:', errorText);
    throw new Error('Failed to refresh token - user may need to reconnect');
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabaseAdmin.from('oauth_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || token.refresh_token,
    expires_at: newExpiresAt.toISOString(),
    updated_at: new Date().toISOString()
  }).eq('user_id', userId).eq('provider', 'microsoft');

  return tokens.access_token;
}

async function fetchDrives(accessToken: string): Promise<any[]> {
  const drives: any[] = [];

  // Get user's OneDrive
  try {
    const myDriveRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (myDriveRes.ok) {
      const myDrive = await myDriveRes.json();
      drives.push({
        id: myDrive.id,
        name: 'My OneDrive',
        type: 'personal',
        webUrl: myDrive.webUrl
      });
    }
  } catch (e) {
    console.error('[link-sharepoint] Error fetching OneDrive:', e);
  }

  // Get SharePoint sites the user follows or has access to
  try {
    const sitesRes = await fetch('https://graph.microsoft.com/v1.0/sites?search=*', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (sitesRes.ok) {
      const sites = await sitesRes.json();
      for (const site of (sites.value || []).slice(0, 10)) {
        // Get the default drive for each site
        try {
          const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drive`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (driveRes.ok) {
            const drive = await driveRes.json();
            drives.push({
              id: drive.id,
              name: site.displayName || site.name,
              type: 'sharepoint',
              siteId: site.id,
              webUrl: site.webUrl
            });
          }
        } catch (e) {
          console.error('[link-sharepoint] Error fetching site drive:', e);
        }
      }
    }
  } catch (e) {
    console.error('[link-sharepoint] Error fetching SharePoint sites:', e);
  }

  return drives;
}

async function fetchDriveItems(accessToken: string, driveId: string, folderId?: string): Promise<DriveItem[]> {
  const path = folderId 
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

  const response = await fetch(`${path}?$top=100&$orderby=name`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[link-sharepoint] Error fetching drive items:', errorText);
    throw new Error('Failed to fetch drive items');
  }

  const data = await response.json();
  return data.value || [];
}

async function searchDriveItems(accessToken: string, driveId: string, query: string): Promise<DriveItem[]> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root/search(q='${encodeURIComponent(query)}')`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[link-sharepoint] Search error:', errorText);
    throw new Error('Search failed');
  }

  const data = await response.json();
  return (data.value || []).filter((item: any) => item.file); // Only return files, not folders
}

async function fetchItemMetadata(accessToken: string, driveId: string, itemId: string): Promise<DriveItem> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('File not found');
    }
    if (response.status === 403) {
      throw new Error('Permission denied');
    }
    throw new Error(`Failed to fetch file metadata: ${response.status}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[link-sharepoint] Request received');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: LinkDocumentRequest = await req.json();
    const { action } = body;

    console.log('[link-sharepoint] Action:', action, 'User:', user.id);

    // Get OAuth token
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .single();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: 'Not connected to Microsoft. Please connect first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken: string;
    try {
      accessToken = await refreshTokenIfNeeded(supabaseAdmin, user.id, tokenRecord as TokenRecord);
    } catch (refreshError) {
      return new Response(
        JSON.stringify({ error: 'Token expired. Please reconnect to Microsoft.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different actions
    switch (action) {
      case 'browse-drives': {
        const drives = await fetchDrives(accessToken);
        return new Response(
          JSON.stringify({ drives }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'browse-items': {
        if (!body.drive_id) {
          return new Response(
            JSON.stringify({ error: 'drive_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const items = await fetchDriveItems(accessToken, body.drive_id, body.folder_id);
        return new Response(
          JSON.stringify({ items }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'search': {
        if (!body.drive_id || !body.search_query) {
          return new Response(
            JSON.stringify({ error: 'drive_id and search_query are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const items = await searchDriveItems(accessToken, body.drive_id, body.search_query);
        return new Response(
          JSON.stringify({ items }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-version': {
        if (!body.document_link_id) {
          return new Response(
            JSON.stringify({ error: 'document_link_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the document link
        const { data: docLink, error: docError } = await supabaseAdmin
          .from('document_links')
          .select('*')
          .eq('id', body.document_link_id)
          .single();

        if (docError || !docLink) {
          return new Response(
            JSON.stringify({ error: 'Document link not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch current metadata from Graph
        const currentItem = await fetchItemMetadata(accessToken, docLink.drive_id, docLink.item_id);
        const currentVersionId = currentItem.eTag || currentItem.lastModifiedDateTime;

        const hasChanged = docLink.version_id && currentVersionId !== docLink.version_id;

        return new Response(
          JSON.stringify({ 
            hasChanged,
            currentVersionId,
            storedVersionId: docLink.version_id,
            lastModified: currentItem.lastModifiedDateTime
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'confirm-version': {
        if (!body.document_link_id) {
          return new Response(
            JSON.stringify({ error: 'document_link_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the document link
        const { data: docLink, error: docError } = await supabaseAdmin
          .from('document_links')
          .select('*')
          .eq('id', body.document_link_id)
          .single();

        if (docError || !docLink) {
          return new Response(
            JSON.stringify({ error: 'Document link not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch current metadata
        const currentItem = await fetchItemMetadata(accessToken, docLink.drive_id, docLink.item_id);
        const newVersionId = currentItem.eTag || currentItem.lastModifiedDateTime;

        // Update the version
        const { error: updateError } = await supabaseAdmin
          .from('document_links')
          .update({
            version_id: newVersionId,
            current_version_id: newVersionId,
            version_confirmed_at: new Date().toISOString()
          })
          .eq('id', body.document_link_id);

        if (updateError) {
          throw updateError;
        }

        // Audit log
        await supabaseAdmin.from('document_link_audit').insert({
          document_link_id: body.document_link_id,
          action: 'version_confirmed',
          user_uuid: user.id,
          details: { new_version_id: newVersionId, previous_version_id: docLink.version_id }
        });

        return new Response(
          JSON.stringify({ success: true, newVersionId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'link': {
        if (!body.drive_id || !body.item_id) {
          return new Response(
            JSON.stringify({ error: 'drive_id and item_id are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch file metadata from Graph
        let fileMetadata: DriveItem;
        try {
          fileMetadata = await fetchItemMetadata(accessToken, body.drive_id, body.item_id);
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to fetch file metadata' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract file extension
        const fileName = fileMetadata.name || '';
        const lastDot = fileName.lastIndexOf('.');
        const fileExtension = lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : null;

        // Get version ID
        const versionId = fileMetadata.eTag || fileMetadata.lastModifiedDateTime;

        // Upsert the document link
        const { data: docLink, error: insertError } = await supabaseAdmin
          .from('document_links')
          .upsert({
            tenant_id: (tokenRecord as TokenRecord).tenant_id,
            user_uuid: user.id,
            provider: 'microsoft',
            drive_id: body.drive_id,
            item_id: body.item_id,
            file_name: fileMetadata.name,
            file_extension: fileExtension,
            mime_type: fileMetadata.file?.mimeType,
            file_size: fileMetadata.size,
            web_url: fileMetadata.webUrl,
            version_id: versionId,
            current_version_id: versionId,
            client_id: body.client_id,
            package_id: body.package_id,
            process_id: body.process_id,
            task_id: body.task_id,
            meeting_id: body.meeting_id,
            evidence_type: body.evidence_type,
            notes: body.notes,
            version_confirmed_at: new Date().toISOString()
          }, {
            onConflict: 'provider,drive_id,item_id'
          })
          .select()
          .single();

        if (insertError) {
          console.error('[link-sharepoint] Insert error:', insertError);
          if (insertError.code === '23505') {
            return new Response(
              JSON.stringify({ error: 'This document is already linked' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          throw insertError;
        }

        // Determine linked entity for audit
        let linkedEntityType = null;
        let linkedEntityId = null;
        if (body.client_id) {
          linkedEntityType = 'client';
          linkedEntityId = String(body.client_id);
        } else if (body.package_id) {
          linkedEntityType = 'package';
          linkedEntityId = String(body.package_id);
        } else if (body.task_id) {
          linkedEntityType = 'task';
          linkedEntityId = body.task_id;
        } else if (body.meeting_id) {
          linkedEntityType = 'meeting';
          linkedEntityId = body.meeting_id;
        }

        // Audit log
        await supabaseAdmin.from('document_link_audit').insert({
          document_link_id: docLink.id,
          action: 'document_linked',
          user_uuid: user.id,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityId,
          details: {
            file_name: fileMetadata.name,
            drive_id: body.drive_id,
            item_id: body.item_id
          }
        });

        console.log('[link-sharepoint] Document linked:', docLink.id);

        return new Response(
          JSON.stringify({ success: true, documentLink: docLink }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'link-email-attachments': {
        // Link email attachments as document links (metadata only - no file fetching)
        if (!body.client_id) {
          return new Response(
            JSON.stringify({ error: 'client_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!body.attachment_list || !Array.isArray(body.attachment_list) || body.attachment_list.length === 0) {
          return new Response(
            JSON.stringify({ error: 'attachment_list is required and must be non-empty' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[link-sharepoint] Linking email attachments:', body.attachment_list.length);

        const linkedDocuments: any[] = [];
        const errors: string[] = [];

        for (const attachment of body.attachment_list) {
          if (!attachment.file_name) {
            errors.push('Missing file_name for attachment');
            continue;
          }

          // Extract file extension
          const lastDot = attachment.file_name.lastIndexOf('.');
          const fileExtension = lastDot > 0 ? attachment.file_name.substring(lastDot + 1).toLowerCase() : null;

          // Create a unique item_id based on email + attachment combo
          const itemId = body.email_message_id 
            ? `email-${body.email_message_id}-${attachment.provider_item_id || attachment.file_name}`
            : `email-attachment-${Date.now()}-${attachment.file_name}`;

          try {
            const { data: docLink, error: insertError } = await supabaseAdmin
              .from('document_links')
              .insert({
                tenant_id: (tokenRecord as TokenRecord).tenant_id,
                user_uuid: user.id,
                provider: 'outlook_attachment',
                drive_id: 'email',
                item_id: itemId,
                file_name: attachment.file_name,
                file_extension: fileExtension,
                mime_type: attachment.mime_type,
                file_size: attachment.size,
                web_url: attachment.source_url || '#email-attachment',
                source_type: 'outlook_attachment',
                source_email_id: body.email_message_id || null,
                client_id: body.client_id,
                package_id: body.package_id,
                task_id: body.task_id,
                evidence_type: body.evidence_type,
                notes: body.notes
              })
              .select()
              .single();

            if (insertError) {
              console.error('[link-sharepoint] Insert attachment error:', insertError);
              if (insertError.code === '23505') {
                errors.push(`Attachment "${attachment.file_name}" is already linked`);
              } else {
                errors.push(`Failed to link "${attachment.file_name}": ${insertError.message}`);
              }
              continue;
            }

            linkedDocuments.push(docLink);

            // Audit log for each attachment
            await supabaseAdmin.from('document_link_audit').insert({
              document_link_id: docLink.id,
              action: 'document_linked_from_email',
              user_uuid: user.id,
              linked_entity_type: 'client',
              linked_entity_id: String(body.client_id),
              details: {
                file_name: attachment.file_name,
                source: 'email_attachment',
                email_message_id: body.email_message_id,
                external_message_id: body.external_message_id
              }
            });

          } catch (e) {
            console.error('[link-sharepoint] Error linking attachment:', e);
            errors.push(`Failed to link "${attachment.file_name}"`);
          }
        }

        console.log('[link-sharepoint] Linked', linkedDocuments.length, 'attachments');

        return new Response(
          JSON.stringify({ 
            success: linkedDocuments.length > 0,
            linkedDocuments,
            linkedCount: linkedDocuments.length,
            errors: errors.length > 0 ? errors : undefined
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[link-sharepoint] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
