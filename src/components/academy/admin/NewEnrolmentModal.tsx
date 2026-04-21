import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useBulkEnroll,
  useEnrollableLearners,
  usePublishedCourses,
} from "@/hooks/academy/useAcademyEnrollments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewEnrolmentModal({ open, onOpenChange }: Props) {
  const { data: learners = [], isLoading: loadingLearners } = useEnrollableLearners();
  const { data: courses = [], isLoading: loadingCourses } = usePublishedCourses();
  const bulkEnrol = useBulkEnroll();

  const [learnerSearch, setLearnerSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedLearners, setSelectedLearners] = useState<Set<string>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<number>>(new Set());
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  const filteredLearners = useMemo(() => {
    const s = learnerSearch.toLowerCase().trim();
    if (!s) return learners;
    return learners.filter((l) =>
      `${l.first_name} ${l.last_name} ${l.email} ${l.tenant_name}`.toLowerCase().includes(s)
    );
  }, [learners, learnerSearch]);

  const filteredCourses = useMemo(() => {
    const s = courseSearch.toLowerCase().trim();
    if (!s) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(s));
  }, [courses, courseSearch]);

  const reset = () => {
    setSelectedLearners(new Set());
    setSelectedCourses(new Set());
    setExpiresAt(undefined);
    setNotes("");
    setLearnerSearch("");
    setCourseSearch("");
  };

  const toggleLearner = (key: string) => {
    setSelectedLearners((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleCourse = (id: number) => {
    setSelectedCourses((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleSubmit = async () => {
    const learnerObjs = learners
      .filter((l) => selectedLearners.has(`${l.user_id}::${l.tenant_id ?? "null"}`))
      .map((l) => ({ user_id: l.user_id, tenant_id: l.tenant_id }));

    await bulkEnrol.mutateAsync({
      learners: learnerObjs,
      courseIds: Array.from(selectedCourses),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      notes: notes.trim() || null,
    });
    reset();
    onOpenChange(false);
  };

  const canSubmit = selectedLearners.size > 0 && selectedCourses.size > 0 && !bulkEnrol.isPending;

  return (
    <AppModal open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>New Enrolment</AppModalTitle>
          <AppModalDescription>
            Bulk-enrol one or more learners across one or more courses. Existing enrolments will be skipped.
          </AppModalDescription>
        </AppModalHeader>

        <AppModalBody>
          <div className="grid gap-5">
            {/* Learners */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Learners {selectedLearners.size > 0 && (
                    <Badge variant="secondary" className="ml-2">{selectedLearners.size} selected</Badge>
                  )}
                </label>
                {selectedLearners.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLearners(new Set())}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search learners by name, email or tenant…"
                  value={learnerSearch}
                  onChange={(e) => setLearnerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-48 rounded-md border">
                {loadingLearners ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                ) : filteredLearners.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No learners match your search.</div>
                ) : (
                  <div className="divide-y">
                    {filteredLearners.slice(0, 200).map((l) => {
                      const key = `${l.user_id}::${l.tenant_id ?? "null"}`;
                      const checked = selectedLearners.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleLearner(key)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleLearner(key)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {l.first_name} {l.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {l.email} · {l.tenant_name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {filteredLearners.length > 200 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Showing first 200 of {filteredLearners.length}. Refine your search to narrow down.
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </section>

            {/* Courses */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Courses {selectedCourses.size > 0 && (
                    <Badge variant="secondary" className="ml-2">{selectedCourses.size} selected</Badge>
                  )}
                </label>
                {selectedCourses.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCourses(new Set())}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search published courses…"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-40 rounded-md border">
                {loadingCourses ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                ) : filteredCourses.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No courses match your search.</div>
                ) : (
                  <div className="divide-y">
                    {filteredCourses.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCourse(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={selectedCourses.has(c.id)}
                          onCheckedChange={() => toggleCourse(c.id)}
                        />
                        <span className="text-sm truncate">{c.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </section>

            {/* Expiry + notes */}
            <section className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiry (optional)</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !expiresAt && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiresAt ? format(expiresAt, "PPP") : "No expiry"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={expiresAt}
                      onSelect={setExpiresAt}
                      disabled={(d) => d < new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {expiresAt && (
                  <Button variant="ghost" size="sm" onClick={() => setExpiresAt(undefined)}>
                    <X className="h-3 w-3 mr-1" /> Clear expiry
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  placeholder="Internal notes for this enrolment…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </section>

            {selectedLearners.size > 0 && selectedCourses.size > 0 && (
              <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
                Will create up to <strong>{selectedLearners.size * selectedCourses.size}</strong> enrolment
                {selectedLearners.size * selectedCourses.size === 1 ? "" : "s"} ({selectedLearners.size} learner
                {selectedLearners.size === 1 ? "" : "s"} × {selectedCourses.size} course
                {selectedCourses.size === 1 ? "" : "s"}). Existing enrolments will be skipped.
              </div>
            )}
          </div>
        </AppModalBody>

        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {bulkEnrol.isPending ? "Enrolling…" : "Create enrolments"}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
