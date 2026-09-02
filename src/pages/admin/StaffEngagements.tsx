import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type Engagement = {
  id: string;
  first_name: string;
  last_name: string;
  person_email: string;
  role: string;
  engagement_type: string;
  type: string;
  status: string;
  start_date: string | null;
  created_at: string;
  created_by: string | null;
};

const formSchema = z.object({
  first_name: z.string().trim().min(1, "Required"),
  last_name: z.string().trim().min(1, "Required"),
  person_email: z.string().trim().email("Valid email required"),
  role: z.string().trim().min(1, "Required"),
  engagement_type: z.enum(["contractor", "employee"]),
  checklist_type: z.enum(["onboarding", "offboarding"]),
  start_date: z.date({ required_error: "Required" }),
});

type FormValues = z.infer<typeof formSchema>;

function TypeBadge({ value }: { value: string }) {
  const isOnboarding = value === "onboarding";
  return (
    <Badge
      variant="outline"
      className={cn(
        isOnboarding
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      )}
    >
      {isOnboarding ? "Onboarding" : "Offboarding"}
    </Badge>
  );
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_progress: {
      label: "In Progress",
      cls: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    },
    pending_signoff: {
      label: "Pending Sign-Off",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    completed: {
      label: "Completed",
      cls: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300",
    },
    cancelled: {
      label: "Cancelled",
      cls: "border-muted bg-muted text-muted-foreground",
    },
  };
  const entry = map[value] ?? { label: value, cls: "" };
  return (
    <Badge variant="outline" className={entry.cls}>
      {entry.label}
    </Badge>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMMM yyyy");
  } catch {
    return "—";
  }
}

function NewEngagementDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      person_email: "",
      role: "",
      engagement_type: "employee",
      checklist_type: "onboarding",
    },

  });

  const checklistType = form.watch("checklist_type");
  const dateLabel = checklistType === "offboarding" ? "Last Day" : "First Day";

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw new Error("Not authenticated");

      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        person_email: values.person_email,
        role: values.role,
        engagement_type: values.engagement_type,
        type: values.checklist_type,
        start_date: format(values.start_date, "yyyy-MM-dd"),
        status: "in_progress",
        created_by: userRes.user.id,
      };

      const { error } = await supabase.from("staff_engagements").insert(payload);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Engagement created" });
      queryClient.invalidateQueries({ queryKey: ["staff_engagements"] });
      form.reset();
      setOpen(false);
      onCreated();
    },
    onError: (e) => {
      toast({
        title: "Could not create engagement",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Engagement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Engagement</DialogTitle>
          <DialogDescription>
            Start an onboarding or offboarding checklist for a Vivacity team member.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="person_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role at Vivacity</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Team Member, Admin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="engagement_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Engagement type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="contractor" id="eng-contractor" />
                        <Label htmlFor="eng-contractor">Contractor</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="employee" id="eng-employee" />
                        <Label htmlFor="eng-employee">Employee</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="checklist_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checklist type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="onboarding" id="cl-onboarding" />
                        <Label htmlFor="cl-onboarding">Onboarding</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="offboarding" id="cl-offboarding" />
                        <Label htmlFor="cl-offboarding">Offboarding</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{dateLabel}</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-[240px] justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffEngagements() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.unicorn_role;
  const allowed = role === "Super Admin" || role === "Integrator";

  const [showCancelled, setShowCancelled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff_engagements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_engagements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Engagement[];
    },
    enabled: allowed,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return showCancelled ? all : all.filter((r) => r.status !== "cancelled");
  }, [data, showCancelled]);

  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground mt-2">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return (
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">People</h1>
            <p className="text-muted-foreground">
              Manage staff onboarding and offboarding
            </p>
          </div>
          <NewEngagementDialog onCreated={() => { /* invalidation handled in mutation */ }} />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="show-cancelled"
            checked={showCancelled}
            onCheckedChange={setShowCancelled}
          />
          <Label htmlFor="show-cancelled">Show cancelled</Label>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No engagements yet
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/staff-engagements/${r.id}`)}
                  >
                    <TableCell className="font-medium">{`${r.first_name} ${r.last_name}`}</TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell><TypeBadge value={r.type} /></TableCell>
                    <TableCell><StatusBadge value={r.status} /></TableCell>
                    <TableCell>{fmtDate(r.start_date)}</TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}
