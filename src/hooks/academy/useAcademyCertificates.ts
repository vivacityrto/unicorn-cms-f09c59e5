import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const CERT_KEY = "academy-certificates-admin";

export interface CertRow {
  id: number;
  certificate_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  tenant_id: number | null;
  tenant_name: string;
  course_id: number;
  course_title: string;
  issued_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  public_url: string | null;
  storage_path: string | null;
  enrollment_id: number;
  metadata: Json | null;
}

export function useAdminCertificates() {
  return useQuery<CertRow[]>({
    queryKey: [CERT_KEY],
    queryFn: async () => {
      const { data: certData, error } = await supabase
        .from("academy_certificates")
        .select("id, certificate_number, user_id, course_id, tenant_id, enrollment_id, issued_at, expires_at, revoked_at, revoke_reason, public_url, storage_path, metadata")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      if (!certData?.length) return [];

      const userIds = [...new Set(certData.map((c) => c.user_id))];
      const courseIds = [...new Set(certData.map((c) => c.course_id))];
      const tenantIds = [...new Set(certData.map((c) => c.tenant_id).filter(Boolean))] as number[];

      const [{ data: users }, { data: courses }, { data: tenantsList }] = await Promise.all([
        supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, name").in("id", tenantIds)
          : Promise.resolve({ data: [] }),
      ]);

      const userMap = new Map((users ?? []).map((u) => [u.user_uuid, u]));
      const courseMap = new Map((courses ?? []).map((c) => [c.id, c.title]));
      const tenantMap = new Map((tenantsList ?? []).map((t) => [t.id, t.name]));

      return certData.map((c) => {
        const user = userMap.get(c.user_id);
        const email = user?.email ?? "";
        const fullName = user
          ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
          : "";
        return {
          id: c.id,
          certificate_number: c.certificate_number,
          user_id: c.user_id,
          user_name: fullName || email || "Unknown",
          user_email: email,
          tenant_id: c.tenant_id,
          tenant_name: c.tenant_id ? (tenantMap.get(c.tenant_id) ?? `Tenant ${c.tenant_id}`) : "—",
          course_id: c.course_id,
          course_title: courseMap.get(c.course_id) ?? `Course ${c.course_id}`,
          issued_at: c.issued_at,
          expires_at: c.expires_at,
          revoked_at: c.revoked_at,
          revoke_reason: c.revoke_reason,
          public_url: c.public_url,
          storage_path: c.storage_path,
          enrollment_id: c.enrollment_id,
          metadata: c.metadata,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, courseId, tenantId, metadata }: {
      userId: string;
      courseId: number;
      tenantId?: number | null;
      metadata?: Json | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Find or create enrollment
      const { data: existing } = await supabase
        .from("academy_enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .maybeSingle();

      let enrollmentId: number;
      if (existing) {
        enrollmentId = existing.id;
      } else {
        const { data: newEnrol, error: enrolErr } = await supabase
          .from("academy_enrollments")
          .insert({
            user_id: userId,
            course_id: courseId,
            tenant_id: tenantId ?? null,
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (enrolErr) throw enrolErr;
        enrollmentId = newEnrol.id;
      }

      // Generate certificate number
      const { data: certNum, error: rpcErr } = await supabase.rpc("generate_certificate_number");
      if (rpcErr) throw rpcErr;

      const { error } = await supabase.from("academy_certificates").insert({
        user_id: userId,
        course_id: courseId,
        enrollment_id: enrollmentId,
        certificate_number: certNum,
        issued_at: new Date().toISOString(),
        issued_by: user?.id ?? null,
        tenant_id: tenantId ?? null,
        metadata: metadata ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate issued successfully");
      qc.invalidateQueries({ queryKey: [CERT_KEY] });
    },
    onError: (e: Error) => toast.error(e?.message || "Failed to issue certificate"),
  });
}

export function useRevokeCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("academy_certificates")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id ?? null,
          revoke_reason: reason,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate revoked");
      qc.invalidateQueries({ queryKey: [CERT_KEY] });
    },
    onError: () => toast.error("Failed to revoke certificate"),
  });
}
