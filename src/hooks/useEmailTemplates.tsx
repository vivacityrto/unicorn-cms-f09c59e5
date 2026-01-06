import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EmailTemplate {
  id: string;
  internal_name: string;
  slug: string;
  subject: string;
  html_body: string;
  description: string;
  from_address: string;
  reply_to: string;
  preview_text: string | null;
  editor_type: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface EmailSendLog {
  id: string;
  tenant_id: number;
  package_id: number | null;
  stage_id: number | null;
  email_template_id: string;
  email_template_version: number;
  to_email: string;
  cc_emails: string[];
  subject: string;
  body_html: string;
  body_text: string | null;
  merge_data: Record<string, string>;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
}

export function useEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("internal_name", { ascending: true });

      if (error) throw error;
      setTemplates((data || []) as unknown as EmailTemplate[]);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to load email templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const createTemplate = async (template: Partial<EmailTemplate>) => {
    const { data: userData } = await supabase.auth.getUser();
    
    const slug = template.internal_name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `template-${Date.now()}`;

    const { data, error } = await supabase
      .from("email_templates")
      .insert({
        internal_name: template.internal_name || "New Template",
        slug: slug,
        subject: template.subject || "",
        html_body: template.html_body || "",
        description: template.description || "",
        from_address: template.from_address || "noreply@vivacity.com.au",
        reply_to: template.reply_to || "support@vivacity.com.au",
        preview_text: template.preview_text || null,
        editor_type: "html",
        version: 1,
        status: "draft",
        updated_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    await fetchTemplates();
    return data as unknown as EmailTemplate;
  };

  const updateTemplate = async (id: string, updates: Partial<EmailTemplate>) => {
    const { data: userData } = await supabase.auth.getUser();
    
    // Increment version if content changed
    const currentTemplate = templates.find(t => t.id === id);
    const shouldIncrementVersion = 
      updates.subject !== currentTemplate?.subject || 
      updates.html_body !== currentTemplate?.html_body;

    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id || null,
    };

    if (shouldIncrementVersion && currentTemplate) {
      updateData.version = (currentTemplate.version || 1) + 1;
    }

    // Update slug if name changed
    if (updates.internal_name) {
      updateData.slug = updates.internal_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    const { error } = await supabase
      .from("email_templates")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;
    await fetchTemplates();
  };

  const duplicateTemplate = async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    const newName = `${template.internal_name} (Copy)`;
    return await createTemplate({
      ...template,
      internal_name: newName,
      status: "draft",
    });
  };

  const archiveTemplate = async (id: string) => {
    await updateTemplate(id, { status: "archived" });
  };

  const activateTemplate = async (id: string) => {
    await updateTemplate(id, { status: "active" });
  };

  return {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    duplicateTemplate,
    archiveTemplate,
    activateTemplate,
  };
}

export function useEmailSending() {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const sendEmail = async (params: {
    tenant_id: number;
    package_id?: number;
    stage_id?: number;
    email_template_id: string;
    recipient_type: "tenant" | "internal" | "both";
    to_override?: string;
    dry_run?: boolean;
  }) => {
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(
        `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-stage-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData?.session?.access_token}`,
          },
          body: JSON.stringify(params),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send email");
      }

      if (!params.dry_run) {
        toast({
          title: "Email Sent",
          description: result.message || "Email was sent successfully",
        });
      }

      return result;
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to send email",
        variant: "destructive",
      });
      throw e;
    } finally {
      setSending(false);
    }
  };

  const previewEmail = async (params: {
    tenant_id: number;
    package_id?: number;
    stage_id?: number;
    email_template_id: string;
    recipient_type: "tenant" | "internal" | "both";
  }) => {
    return await sendEmail({ ...params, dry_run: true });
  };

  const testSendToMe = async (params: {
    tenant_id: number;
    package_id?: number;
    stage_id?: number;
    email_template_id: string;
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.email) {
      throw new Error("Cannot determine your email address");
    }

    return await sendEmail({
      ...params,
      recipient_type: "internal",
      to_override: userData.user.email,
    });
  };

  return {
    sending,
    sendEmail,
    previewEmail,
    testSendToMe,
  };
}

export function useEmailSendLogs(templateId?: string) {
  const [logs, setLogs] = useState<EmailSendLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("email_send_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (templateId) {
        query = query.eq("email_template_id", templateId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs((data || []) as unknown as EmailSendLog[]);
    } catch (e) {
      console.error("Failed to load email logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [templateId]);

  return { logs, loading, fetchLogs };
}
