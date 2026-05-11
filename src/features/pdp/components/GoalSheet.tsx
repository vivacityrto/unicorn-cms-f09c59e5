import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

import { StandardsPicker } from "./StandardsPicker";
import { useUpsertGoal } from "../hooks";
import type { PdpGoal, PdpGoalStatus } from "../types";
import type { UpsertGoalInput } from "../api";

const STATUS_OPTIONS: { value: PdpGoalStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "met", label: "Met" },
  { value: "not_met", label: "Not met" },
  { value: "deferred", label: "Deferred" },
];

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Max 200 characters"),
  description: z.string().trim().max(2000, "Max 2000 characters").optional().or(z.literal("")),
  standard_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]),
  target_evidence_count: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1")
    .max(50, "Max 50"),
  target_hours: z
    .union([z.literal(""), z.coerce.number().min(0, "Must be ≥ 0").max(1000, "Max 1000")])
    .optional()
    .nullable(),
  status: z.enum(["open", "in_progress", "met", "not_met", "deferred"]).optional(),
});

type FormValues = z.infer<typeof schema>;

interface GoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: number;
  goal?: PdpGoal | null;
}

export function GoalSheet({ open, onOpenChange, cycleId, goal }: GoalSheetProps) {
  const isMobile = useIsMobile();
  const isEdit = !!goal?.id;
  const upsert = useUpsertGoal(cycleId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      standard_id: null,
      priority: "medium",
      target_evidence_count: 1,
      target_hours: "",
      status: "open",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (goal) {
      form.reset({
        title: goal.title ?? "",
        description: goal.description ?? "",
        standard_id: goal.standard_id ?? null,
        priority: (goal.priority as "high" | "medium" | "low") ?? "medium",
        target_evidence_count: goal.target_evidence_count ?? 1,
        target_hours: goal.target_hours == null ? "" : Number(goal.target_hours),
        status: (goal.status as PdpGoalStatus) ?? "open",
      });
    } else {
      form.reset({
        title: "",
        description: "",
        standard_id: null,
        priority: "medium",
        target_evidence_count: 1,
        target_hours: "",
        status: "open",
      });
    }
  }, [open, goal, form]);

  const onSubmit = (values: FormValues) => {
    const payload: UpsertGoalInput = {
      cycle_id: cycleId,
      title: values.title.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      standard_id: values.standard_id ?? null,
      priority: values.priority,
      target_evidence_count: values.target_evidence_count,
      target_hours:
        values.target_hours === "" || values.target_hours == null
          ? null
          : Number(values.target_hours),
    };
    if (isEdit) {
      payload.id = goal!.id;
      if (values.status) payload.status = values.status;
    }

    upsert.mutate(payload, {
      onSuccess: () => {
        toast.success(isEdit ? "Goal updated" : "Goal created");
        onOpenChange(false);
      },
    });
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
          <SheetTitle>{isEdit ? "Edit goal" : "Add goal"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this professional development goal."
              : "Capture a SMART goal for this PD cycle."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Complete LLN refresher" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Why this goal matters and how you'll achieve it"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
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

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-4"
                    >
                      {[
                        { value: "high", label: "High" },
                        { value: "medium", label: "Medium" },
                        { value: "low", label: "Low" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <RadioGroupItem value={opt.value} />
                          {opt.label}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="target_evidence_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target evidence count</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        {...field}
                        value={field.value ?? 1}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target hours</FormLabel>
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

            {isEdit && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value ?? "open"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <SheetFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={upsert.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {upsert.isPending ? "Saving…" : isEdit ? "Save changes" : "Create goal"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
