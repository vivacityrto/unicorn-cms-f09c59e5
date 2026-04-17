import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, UserPlus2 } from "lucide-react";
import { useStaffRoles, useStaffLocations, useResolvedRule } from "@/hooks/useStaffProvisioningRules";
import { deriveMailNickname, deriveUpn, deriveDisplayName, generateTempPassword } from "@/lib/m365/derive";
import { generatePowerShellScript } from "@/lib/m365/scriptGenerator";
import { StaffProvisioningPreview } from "@/components/admin/team-users/StaffProvisioningPreview";
import { TeamLeaderEmailDialog } from "@/components/admin/team-users/TeamLeaderEmailDialog";
import { PostSaveSetupLinks } from "@/components/admin/team-users/PostSaveSetupLinks";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3 | 4 | 5;

interface FormState {
  firstName: string;
  lastName: string;
  preferredName: string;
  personalEmail: string;
  phone: string;
  locationCode: string;
  startDate: string;
  roleCode: string;
  jobTitle: string;
  teamLeaderId: string;
  upn: string;
  mailNickname: string;
  displayName: string;
  tempPassword: string;
}

const initial: FormState = {
  firstName: "",
  lastName: "",
  preferredName: "",
  personalEmail: "",
  phone: "",
  locationCode: "AU",
  startDate: "",
  roleCode: "",
  jobTitle: "",
  teamLeaderId: "",
  upn: "",
  mailNickname: "",
  displayName: "",
  tempPassword: "",
};

export default function NewStarterWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillUserId = searchParams.get("prefill");
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(initial);
  const [isRedo, setIsRedo] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [teamLeaders, setTeamLeaders] = useState<{ user_uuid: string; first_name: string; last_name: string; email: string }[]>([]);

  const roles = useStaffRoles();
  const locations = useStaffLocations();
  const resolved = useResolvedRule(form.roleCode || null, form.locationCode || null);

  // Auto-derive M365 fields when name changes
  useEffect(() => {
    if (form.firstName && form.lastName) {
      setForm((f) => ({
        ...f,
        upn: f.upn || deriveUpn(f.firstName, f.lastName),
        mailNickname: f.mailNickname || deriveMailNickname(f.firstName, f.lastName),
        displayName: f.displayName || deriveDisplayName(f.firstName, f.lastName, f.preferredName),
        tempPassword: f.tempPassword || generateTempPassword(),
      }));
    }
  }, [form.firstName, form.lastName, form.preferredName]);

  // Load team leaders (Vivacity staff with team_leader level)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, superadmin_level")
        .or("superadmin_level.eq.Team Leader,superadmin_level.eq.Administrator")
        .eq("disabled", false)
        .order("first_name");
      setTeamLeaders((data ?? []) as any);
    })();
  }, []);

  // Prefill from existing user when ?prefill=<uuid> is provided (Redo Setup flow)
  useEffect(() => {
    if (!prefillUserId) return;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("first_name, last_name, email, mobile_phone, job_title, unicorn_role")
        .eq("user_uuid", prefillUserId)
        .maybeSingle();
      if (error || !data) {
        toast({
          title: "Could not prefill user",
          description: error?.message ?? "User not found",
          variant: "destructive",
        });
        return;
      }
      setIsRedo(true);
      setForm((f) => ({
        ...f,
        firstName: data.first_name ?? "",
        lastName: data.last_name ?? "",
        jobTitle: data.job_title ?? "",
        upn: data.email ?? "",
        mailNickname: data.email ? data.email.split("@")[0] : "",
        displayName: [data.first_name, data.last_name].filter(Boolean).join(" "),
        phone: data.mobile_phone ?? "",
      }));
      toast({
        title: "Loaded existing user",
        description: "Review each step, then re-run provisioning.",
      });
    })();
  }, [prefillUserId, toast]);

  const psScript = useMemo(() => {
    if (!resolved.data) return "";
    return generatePowerShellScript({
      firstName: form.firstName,
      lastName: form.lastName,
      upn: form.upn,
      mailNickname: form.mailNickname,
      displayName: form.displayName,
      tempPassword: form.tempPassword,
      usageLocation: form.locationCode,
      m365Groups: resolved.data.m365_groups,
      licenses: resolved.data.licenses,
    });
  }, [resolved.data, form]);

  const setField = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canNext = (): boolean => {
    switch (step) {
      case 1:
        return !!(form.firstName && form.lastName && form.locationCode && form.startDate);
      case 2:
        return !!(form.roleCode && form.teamLeaderId);
      case 3:
        return !!(form.upn && form.mailNickname && form.displayName && form.tempPassword);
      case 4:
        return !!resolved.data;
      default:
        return true;
    }
  };

  const provision = async () => {
    if (!resolved.data) return;
    setProvisioning(true);
    setTranscript([]);
    try {
      const { data, error } = await supabase.functions.invoke("provision-m365-user", {
        body: {
          first_name: form.firstName,
          last_name: form.lastName,
          preferred_name: form.preferredName || null,
          personal_email: form.personalEmail || null,
          phone: form.phone || null,
          role_code: form.roleCode,
          location_code: form.locationCode,
          job_title: form.jobTitle || null,
          start_date: form.startDate || null,
          team_leader_id: form.teamLeaderId || null,
          upn: form.upn,
          mail_nickname: form.mailNickname,
          display_name: form.displayName,
          temp_password: form.tempPassword,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Provisioning failed");
      setRunId(data.run_id);
      setTranscript(data.transcript ?? []);
      const succeeded = data.transcript?.filter((s: any) => s.ok).length ?? 0;
      const total = data.transcript?.length ?? 0;
      const status = data.status as "provisioned" | "partial" | "failed";
      if (status === "provisioned") {
        toast({ title: "Setup complete", description: `${succeeded}/${total} steps succeeded` });
      } else if (status === "partial") {
        toast({
          title: "User saved in Unicorn — M365 needs attention",
          description: `${succeeded}/${total} steps succeeded. Run the PowerShell script or fix Entra permissions.`,
        });
      } else {
        toast({
          title: "Setup failed",
          description: "User could not be saved in Unicorn. Check the transcript.",
          variant: "destructive",
        });
      }
      setEmailDialogOpen(true);
    } catch (e: any) {
      toast({ title: "Provisioning failed", description: e.message, variant: "destructive" });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/team-users")} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Team Users
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <UserPlus2 className="h-7 w-7 text-primary" /> New Team Member Setup
            </h1>
            <p className="text-muted-foreground mt-1">
              Multi-step onboarding with auto-provisioning to Microsoft 365.
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Step {step} of 5
          </Badge>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`flex-1 h-2 rounded-full transition-all ${
                n <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* STEP 1: Personal */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>1. Personal details</CardTitle>
              <CardDescription>Who is starting and where are they based?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First name *</Label>
                  <Input value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Surname *</Label>
                  <Input value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Preferred name (optional)</Label>
                  <Input value={form.preferredName} onChange={(e) => setField("preferredName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Personal phone</Label>
                  <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Personal email</Label>
                  <Input type="email" value={form.personalEmail} onChange={(e) => setField("personalEmail", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={form.locationCode} onValueChange={(v) => setField("locationCode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locations.data?.map((l) => (
                        <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start date *</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Role & Team */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>2. Role &amp; team</CardTitle>
              <CardDescription>This drives which M365 groups, licenses and software get set up.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={form.roleCode} onValueChange={(v) => setField("roleCode", v)}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.data?.map((r) => (
                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Job title</Label>
                  <Input value={form.jobTitle} onChange={(e) => setField("jobTitle", e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Requesting team leader *</Label>
                  <Select value={form.teamLeaderId} onValueChange={(v) => setField("teamLeaderId", v)}>
                    <SelectTrigger><SelectValue placeholder="Who requested this hire?" /></SelectTrigger>
                    <SelectContent>
                      {teamLeaders.map((tl) => (
                        <SelectItem key={tl.user_uuid} value={tl.user_uuid}>
                          {tl.first_name} {tl.last_name} — {tl.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {resolved.data && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" /> Resolved rules for {form.roleCode} / {form.locationCode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {resolved.data.m365_groups.length} groups · {resolved.data.licenses.length} licenses ·{" "}
                    {resolved.data.software.length} software · {resolved.data.calendars.length} calendars
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Derived M365 */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>3. Microsoft 365 identity</CardTitle>
              <CardDescription>Auto-derived from name. Edit if needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>User Principal Name (UPN) *</Label>
                  <Input value={form.upn} onChange={(e) => setField("upn", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Mail nickname</Label>
                  <Input value={form.mailNickname} onChange={(e) => setField("mailNickname", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input value={form.displayName} onChange={(e) => setField("displayName", e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Temporary password (must be changed at first sign-in)</Label>
                  <div className="flex gap-2">
                    <Input value={form.tempPassword} onChange={(e) => setField("tempPassword", e.target.value)} />
                    <Button variant="outline" type="button" onClick={() => setField("tempPassword", generateTempPassword())}>
                      Regenerate
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 4: Preview */}
        {step === 4 && resolved.data && (
          <StaffProvisioningPreview
            firstName={form.firstName}
            lastName={form.lastName}
            displayName={form.displayName}
            upn={form.upn}
            tempPassword={form.tempPassword}
            roleCode={form.roleCode}
            locationCode={form.locationCode}
            rule={resolved.data}
            psScript={psScript}
          />
        )}

        {/* STEP 5: Provision */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>5. Save &amp; provision</CardTitle>
              <CardDescription>
                The user is created in Unicorn first, then we attempt to provision Microsoft 365.
                If M365 fails (e.g. missing permissions), the user is still saved and you can run the
                PowerShell script as a fallback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!runId ? (
                <Button size="lg" onClick={provision} disabled={provisioning} className="w-full">
                  {provisioning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving &amp; provisioning…</>
                  ) : (
                    <>Save in Unicorn &amp; provision M365</>
                  )}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-success/10 p-4 flex items-start gap-3">
                    <Check className="h-5 w-5 text-success mt-0.5" />
                    <div>
                      <div className="font-medium">Run #{runId} created</div>
                      <div className="text-sm text-muted-foreground">
                        {transcript.filter((s) => s.ok).length} of {transcript.length} steps succeeded.
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-80 overflow-auto rounded border p-3 bg-muted/20 text-xs font-mono">
                    {transcript.map((s, i) => (
                      <div key={i} className={s.ok ? "text-foreground" : "text-destructive"}>
                        {s.ok ? "✓" : "✗"} [{s.step}] {s.detail ?? ""}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setEmailDialogOpen(true)} className="flex-1">
                      Send team-leader email
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/admin/team-users")}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 5 && runId && (
          <PostSaveSetupLinks
            newStarter={{
              displayName: form.displayName,
              upn: form.upn,
              tempPassword: form.tempPassword,
            }}
            psScript={psScript}
            onResendEmail={() => setEmailDialogOpen(true)}
          />
        )}

        {/* Footer nav */}
        {step < 5 && (
          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button disabled={!canNext()} onClick={() => setStep((s) => (s + 1) as Step)}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        <Separator />

        <TeamLeaderEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          runId={runId}
          newStarter={{
            firstName: form.firstName,
            lastName: form.lastName,
            displayName: form.displayName,
            upn: form.upn,
            tempPassword: form.tempPassword,
            startDate: form.startDate,
            roleCode: form.roleCode,
          }}
          teamLeader={teamLeaders.find((t) => t.user_uuid === form.teamLeaderId) ?? null}
          rule={resolved.data ?? null}
        />
      </div>
    </DashboardLayout>
  );
}
