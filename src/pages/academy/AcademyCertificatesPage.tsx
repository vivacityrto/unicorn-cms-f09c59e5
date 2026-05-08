import { useQuery } from "@tanstack/react-query";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Award, Download, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface MyCertificate {
  id: number;
  certificate_number: string;
  course_id: number;
  course_title: string;
  recipient_full_name: string | null;
  issued_at: string | null;
  expires_at: string | null;
  public_url: string | null;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

function useMyCertificates() {
  return useQuery<MyCertificate[]>({
    queryKey: ["academy-my-certificates"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: certs, error } = await supabase
        .from("academy_certificates")
        .select(
          "id, certificate_number, course_id, issued_at, expires_at, public_url, metadata"
        )
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      if (!certs || certs.length === 0) return [];

      // Fallback course-title lookup for any cert missing metadata.course_title.
      const missingTitleIds = certs
        .filter((c: any) => !(c.metadata?.course_title))
        .map((c: any) => c.course_id as number);

      const titleMap = new Map<number, string>();
      if (missingTitleIds.length > 0) {
        const { data: courses } = await supabase
          .from("academy_courses")
          .select("id, title")
          .in("id", missingTitleIds);
        (courses ?? []).forEach((c: any) => titleMap.set(c.id, c.title));
      }

      return certs.map((c: any) => ({
        id: c.id,
        certificate_number: c.certificate_number,
        course_id: c.course_id,
        course_title:
          c.metadata?.course_title ?? titleMap.get(c.course_id) ?? `Course ${c.course_id}`,
        recipient_full_name: c.metadata?.recipient_full_name ?? null,
        issued_at: c.issued_at,
        expires_at: c.expires_at,
        public_url: c.public_url,
      }));
    },
    staleTime: 30_000,
  });
}

export default function AcademyCertificatesPage() {
  const { data: certificates, isLoading } = useMyCertificates();

  const handleDownload = (cert: MyCertificate) => {
    if (cert.public_url) {
      window.open(cert.public_url, "_blank", "noopener,noreferrer");
      return;
    }
    // TODO: wire to certificate-PDF Edge Function once available.
    console.warn(
      "[AcademyCertificates] PDF generation Edge Function not wired yet for cert",
      cert.certificate_number
    );
  };

  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
          <p className="text-muted-foreground">
            View and download your earned certificates
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Certificates</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{certificates?.length ?? 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Award className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(certificates ?? []).filter(
                  (c) => !c.expires_at || new Date(c.expires_at) > new Date()
                ).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Calendar className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(certificates ?? []).filter((c) => {
                  if (!c.expires_at) return false;
                  const days = (new Date(c.expires_at).getTime() - Date.now()) / 86_400_000;
                  return days > 0 && days <= 30;
                }).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        {!isLoading && (!certificates || certificates.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No certificates earned yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Complete an Academy course to earn your first certificate.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && certificates && certificates.length > 0 && (
          <div className="space-y-4">
            {certificates.map((cert) => {
              const isExpired = !!cert.expires_at && new Date(cert.expires_at) < new Date();
              return (
                <Card key={cert.id}>
                  <CardContent className="flex items-center gap-4 p-6">
                    <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Award className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{cert.course_title}</h3>
                      {cert.recipient_full_name && (
                        <p className="text-sm text-muted-foreground">
                          Awarded to {cert.recipient_full_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Credential ID: {cert.certificate_number}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span>Issued: {formatDate(cert.issued_at)}</span>
                        {cert.expires_at && <span>Expires: {formatDate(cert.expires_at)}</span>}
                      </div>
                    </div>
                    <Badge variant={isExpired ? "outline" : "secondary"}>
                      {isExpired ? "Expired" : "Active"}
                    </Badge>
                    {cert.public_url ? (
                      <Button variant="outline" size="sm" onClick={() => handleDownload(cert)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button variant="outline" size="sm" disabled>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            PDF generation coming soon
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AcademyLayout>
  );
}
