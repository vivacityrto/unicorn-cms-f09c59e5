import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  metadata: Record<string, any> | null;
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

      const userIds = [...new Set(certData.map((c: any) => c.user_id))];
      const courseIds = [...new Set(certData.map((c: any) => c.course_id))];
      const tenantIds = [...new Set(certData.map((c: any) => c.tenant_id).filter(Boolean))] as number[];

      const [{ data: users }, { data: courses }, { data: tenantsList }] = await Promise.all([
        supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, name").in("id", tenantIds)
          : Promise.resolve({ data: [] }),
      ]);

      const userMap = new Map((users ?? []).map((u: any) => [u.user_uuid, u]));
      const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c.title]));
      const tenantMap = new Map((tenantsList ?? []).map((t: any) => [t.id, t.name]));

      return certData.map((c: any) => {
        const user = userMap.get(c.user_id);
        return {
          id: c.id,
          certificate_number: c.certificate_number,
          user_id: c.user_id,
          user_name: user ? `${user.first_name} ${user.last_name}` : "Unknown",
          user_email: user?.email ?? "",
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
          metadata: c.metadata as Record<string, any> | null,
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
      metadata?: Record<string, any> | null;
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
          } as any)
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
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate issued successfully");
      qc.invalidateQueries({ queryKey: [CERT_KEY] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to issue certificate"),
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
        } as any)
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
