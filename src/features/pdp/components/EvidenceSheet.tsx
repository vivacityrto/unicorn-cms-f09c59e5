import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Award,
  BookMarked,
  BookOpen,
  Briefcase,
  CalendarIcon,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  type LucideIcon,
  MessageSquare,
  Mic,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

import { StandardsPicker } from "./StandardsPicker";
import {
  useCycle,
  useGoals,
  useLogEvidence,
  useUpdateEvidence,
  useUserAcademyEnrollments,
} from "../hooks";
import { signEvidenceDocument } from "../api";
import type { PdpEvidenceItem, PdpEvidenceType } from "../types";

const NONE = "__none__";

const EVIDENCE_TYPES: { value: PdpEvidenceType; label: string; icon: LucideIcon }[] = [
  { value: "academy_completion", label: "Academy completion", icon: GraduationCap },
  { value: "academy_certificate", label: "Academy certificate", icon: Award },
  { value: "external_course", label: "External course", icon: BookOpen },
  { value: "workshop", label: "Workshop", icon: Users },
  { value: "industry_placement", label: "Industry placement", icon: Briefcase },
  { value: "validation_activity", label: "Validation activity", icon: ClipboardCheck },
  { value: "community_of_practice", label: "Community of practice", icon: MessageSquare },
  { value: "conference", label: "Conference", icon: Mic },
  { value: "mentoring", label: "Mentoring", icon: UserCheck },
  { value: "reading", label: "Reading", icon: BookMarked },
  { value: "audit_response", label: "Audit response", icon: Shield },
  { value: "other", label: "Other", icon: FileText },
];

const ACADEMY_TYPES: PdpEvidenceType[] = ["academy_completion", "academy_certificate"];
const PROVIDER_TYPES: PdpEvidenceType[] = ["external_course", "workshop", "conference"];

const ACCEPT_MIME =
  "application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

const schema = z.object({
  evidence_type: z.enum([
    "academy_completion",
    "academy_certificate",
    "external_course",
    "workshop",
    "industry_placement",
    "validation_activity",
    "community_of_practice",
    "conference",
    "mentoring",
    "reading",
    "audit_response",
    "other",
  ]),
  title: z.string().trim().min(1, "Title is required").max(200, "Max 200 characters"),
  description: z.string().trim().max(2000, "Max 2000 characters").optional().nullable(),
  occurred_on: z.string().min(1, "Date is required"),
  duration_hours: z
    .union([z.literal(""), z.coerce.number().min(0, "Must be ≥ 0").max(999, "Max 999")])
    .optional()
    .nullable(),
  is_formal: z.boolean(),
  is_industry_currency: z.boolean(),
  goal_id: z.coerce.number().int().positive().optional().nullable(),
  standard_id: z.string().uuid().optional().nullable(),
  external_provider: z.string().trim().max(200).optional().nullable(),
  external_url: z
    .union([z.literal(""), z.string().trim().url("Must be a valid URL")])
    .optional()
    .nullable(),
  source_enrollment_id: z.coerce.number().int().positive().optional().nullable(),
  source_certificate_id: z.coerce.number().int().positive().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

interface EvidenceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  evidenceItem?: PdpEvidenceItem | null;
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function newToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function EvidenceSheet({
  open,
  onOpenChange,
  cycleId,
  evidenceItem,
}: EvidenceSheetProps) {
  const isMobile = useIsMobile();
  const isEdit = !!evidenceItem?.id;

  const { data: cycle } = useCycle(cycleId);
  const { data: goals = [] } = useGoals(cycleId);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const { data: enrollments = [] } = useUserAcademyEnrollments(currentUserId);

  const create = useLogEvidence(cycleId);
  const update = useUpdateEvidence(cycleId);
  const isPending = create.isPending || update.isPending;

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      evidence_type: "external_course",
      title: "",
      description: "",
      occurred_on: format(new Date(), "yyyy-MM-dd"),
      duration_hours: "",
      is_formal: true,
      is_industry_currency: false,
      goal_id: null,
      standard_id: null,
      external_provider: "",
      external_url: "",
      source_enrollment_id: null,
      source_certificate_id: null,
    },
  });

  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (evidenceItem) {
      form.reset({
        evidence_type: evidenceItem.evidence_type as PdpEvidenceType,
        title: evidenceItem.title ?? "",
        description: evidenceItem.description ?? "",
        occurred_on: evidenceItem.occurred_on ?? format(new Date(), "yyyy-MM-dd"),
        duration_hours:
          evidenceItem.duration_minutes == null
            ? ""
            : Number((evidenceItem.duration_minutes / 60).toFixed(2)),
        is_formal: evidenceItem.is_formal ?? true,
        is_industry_currency: evidenceItem.is_industry_currency ?? false,
        goal_id: evidenceItem.goal_id ?? null,
        standard_id: (evidenceItem as { standard_id?: string | null }).standard_id ?? null,
        external_provider: evidenceItem.external_provider ?? "",
        external_url: evidenceItem.external_url ?? "",
        source_enrollment_id: evidenceItem.source_enrollment_id ?? null,
        source_certificate_id: evidenceItem.source_certificate_id ?? null,
      });
    } else {
      form.reset({
        evidence_type: "external_course",
        title: "",
        description: "",
        occurred_on: format(new Date(), "yyyy-MM-dd"),
        duration_hours: "",
        is_formal: true,
        is_industry_currency: false,
        goal_id: null,
        standard_id: null,
        external_provider: "",
        external_url: "",
        source_enrollment_id: null,
        source_certificate_id: null,
      });
    }
  }, [open, evidenceItem, form]);

  const evidenceType = form.watch("evidence_type");
  const isAcademy = ACADEMY_TYPES.includes(evidenceType);
  const showProvider = PROVIDER_TYPES.includes(evidenceType);
  const showCurrency = cycle?.audience_code === "trainer";

  const enrollmentOptions = useMemo(
    () =>
      enrollments.map((e) => ({
        value: String(e.id),
        label: e.course?.title ?? `Enrollment #${e.id}`,
        completedAt: e.completed_at,
        enrollment: e,
      })),
    [enrollments],
  );

  const handlePickEnrollment = async (enrollmentIdStr: string) => {
    const match = enrollments.find((e) => String(e.id) === enrollmentIdStr);
    if (!match) return;
    form.setValue("source_enrollment_id", match.id);
    form.setValue(
      "source_certificate_id",
      evidenceType === "academy_certificate" ? match.certificate?.id ?? null : null,
    );
    if (match.course?.title) form.setValue("title", match.course.title);
    if (match.completed_at) {
      form.setValue("occurred_on", match.completed_at.slice(0, 10));
    }

    // Primary: sum estimated_minutes across published lessons for this course.
    // Fallback: course-level estimated_minutes when the lesson sum is 0/null.
    let minutes: number | null = null;
    try {
      const { data: lessons } = await supabase
        .from("academy_lessons")
        .select("estimated_minutes")
        .eq("course_id", match.course_id)
        .eq("is_published", true);
      const lessonSum = (lessons ?? []).reduce(
        (acc, l) => acc + (l.estimated_minutes ?? 0),
        0,
      );
      if (lessonSum > 0) {
        minutes = lessonSum;
      } else if (match.course?.estimated_minutes && match.course.estimated_minutes > 0) {
        minutes = match.course.estimated_minutes;
      }
    } catch {
      if (match.course?.estimated_minutes && match.course.estimated_minutes > 0) {
        minutes = match.course.estimated_minutes;
      }
    }
    if (minutes != null) {
      form.setValue("duration_hours", Number((minutes / 60).toFixed(2)));
    }
  };

  const handleViewDocument = async () => {
    if (!evidenceItem?.document_path) return;
    try {
      const url = await signEvidenceDocument(evidenceItem.document_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document");
    }
  };

  const onSubmit = async (values: FormValues) => {
    let documentPath: string | null | undefined = undefined; // undefined = leave as-is on edit

    if (file && currentUserId) {
      try {
        setUploading(true);
        const path = `pdp/${currentUserId}/${cycleId}/${newToken()}-${safeFilename(file.name)}`;
        const { error: uploadErr } = await supabase.storage
          .from("academy-evidence")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadErr) throw uploadErr;
        documentPath = path;
      } catch (err) {
        setUploading(false);
        toast.error(err instanceof Error ? err.message : "Upload failed");
        return;
      }
      setUploading(false);
    }

    const durationMinutes =
      values.duration_hours === "" || values.duration_hours == null
        ? null
        : Math.round(Number(values.duration_hours) * 60);

    // Build payload — drop manual-only fields when academy type
    const basePayload: Partial<PdpEvidenceItem> = {
      cycle_id: cycleId,
      evidence_type: values.evidence_type,
      title: values.title.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      occurred_on: values.occurred_on,
      duration_minutes: durationMinutes,
      is_formal: values.is_formal,
      is_industry_currency: showCurrency ? values.is_industry_currency : false,
      goal_id: values.goal_id ?? null,
      // standard_id is a new column added in this migration; cast through a typed extension
      ...({ standard_id: values.standard_id ?? null } as { standard_id: string | null }),
      external_provider:
        !isAcademy && showProvider && values.external_provider?.trim()
          ? values.external_provider.trim()
          : null,
      external_url:
        !isAcademy && values.external_url
          ? String(values.external_url).trim() || null
          : null,
      source_enrollment_id: isAcademy ? values.source_enrollment_id ?? null : null,
      source_certificate_id:
        evidenceType === "academy_certificate"
          ? values.source_certificate_id ?? null
          : null,
    };
    if (documentPath !== undefined) {
      basePayload.document_path = documentPath;
    }

    try {
      if (isEdit && evidenceItem) {
        await update.mutateAsync({ id: evidenceItem.id, ...basePayload });
        toast.success("Evidence updated");
      } else {
        await create.mutateAsync({
          ...basePayload,
          cycle_id: cycleId,
          evidence_type: values.evidence_type,
          title: values.title.trim(),
          occurred_on: values.occurred_on,
        });
        toast.success("Evidence logged");
      }
      onOpenChange(false);
    } catch {
      // toast already raised by mutation onError
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "max-h-[90vh] overflow-y-auto"
            : "sm:max-w-lg w-full overflow-y-auto"
        }
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit evidence" : "Log evidence"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this professional development evidence record."
              : "Capture evidence of professional development for this cycle."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <FormField
              control={form.control}
              name="evidence_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EVIDENCE_TYPES.map(({ value, label, icon: Icon }) => (
                        <SelectItem key={value} value={value}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isAcademy && (
              <FormField
                control={form.control}
                name="source_enrollment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academy course *</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : NONE}
                      onValueChange={(v) => v !== NONE && handlePickEnrollment(v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a completed course" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {enrollmentOptions.length === 0 && (
                          <SelectItem value={NONE} disabled>
                            No completed courses
                          </SelectItem>
                        )}
                        {enrollmentOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                            {opt.completedAt &&
                              ` — ${format(parseISO(opt.completedAt), "dd/MM/yyyy")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Title, date and duration are pre-filled from the selected course.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isAcademy && (
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. LLN refresher workshop" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isAcademy && (
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="What was learned and how it applies"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="occurred_on"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value
                              ? format(parseISO(field.value), "dd/MM/yyyy")
                              : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? parseISO(field.value) : undefined}
                          onSelect={(d) =>
                            field.onChange(d ? format(d, "yyyy-MM-dd") : "")
                          }
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="goal_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Linked goal</FormLabel>
                  <Select
                    value={field.value ? String(field.value) : NONE}
                    onValueChange={(v) =>
                      field.onChange(v === NONE ? null : Number(v))
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="No goal linked" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="standard_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Standard reference</FormLabel>
                  <FormControl>
                    <StandardsPicker
                      value={field.value ?? null}
                      onChange={(id) => field.onChange(id)}
                      allowClear
                      placeholder="Optional — link to a Standard"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isAcademy && showProvider && (
              <FormField
                control={form.control}
                name="external_provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. VELG Training"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isAcademy && (
              <FormField
                control={form.control}
                name="external_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://..."
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isAcademy && (
              <FormItem>
                <FormLabel>Document</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept={ACCEPT_MIME}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormDescription>
                  PDF, image, or Word doc. Max 10 MB.
                </FormDescription>
                {isEdit && evidenceItem?.document_path && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={handleViewDocument}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    View existing document
                  </Button>
                )}
              </FormItem>
            )}

            <FormField
              control={form.control}
              name="is_formal"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Formal PD</FormLabel>
                    <FormDescription>
                      Counts toward formal professional development hours.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {showCurrency && (
              <FormField
                control={form.control}
                name="is_industry_currency"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Industry currency</FormLabel>
                      <FormDescription>
                        Counts toward industry currency hours (trainers).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <SheetFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending || uploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || uploading}>
                {(isPending || uploading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {uploading
                  ? "Uploading…"
                  : isPending
                    ? "Saving…"
                    : isEdit
                      ? "Save changes"
                      : "Log evidence"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
