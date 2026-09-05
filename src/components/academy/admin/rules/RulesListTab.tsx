import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, Search, Zap } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import {
  usePackagesActive,
  usePublishedCourses,
  useAllPackageCourseRules,
  useToggleRule,
  useArchiveRule,
  packageTypeStyle,
  type RuleRow,
} from "@/hooks/academy/useAcademyPackageRules";
import BackfillConfirmModal from "./BackfillConfirmModal";

export default function RulesListTab() {
  const { data: packages = [] } = usePackagesActive();
  const { data: courses = [] } = usePublishedCourses();
  const { data: rules = [], isLoading } = useAllPackageCourseRules();
  const toggleRule = useToggleRule();
  const archiveRule = useArchiveRule();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [backfillRule, setBackfillRule] = useState<RuleRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RuleRow | null>(null);

  const pkgMap = useMemo(() => new Map(packages.map((p) => [p.id, p])), [packages]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rules.filter((r) => {
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;
      if (!q) return true;
      const pkgName = pkgMap.get(r.package_id)?.name?.toLowerCase() ?? "";
      const courseTitle = courseMap.get(r.course_id)?.title?.toLowerCase() ?? "";
      return pkgName.includes(q) || courseTitle.includes(q);
    });
  }, [rules, statusFilter, search, pkgMap, courseMap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-72"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} of {rules.length} rules
        </span>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No rules match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const pkg = pkgMap.get(r.package_id);
                const course = courseMap.get(r.course_id);
                const style = packageTypeStyle(pkg?.package_type ?? null);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{pkg?.name ?? `#${r.package_id}`}</span>
                        <Badge className={style.chip} variant="secondary">
                          {style.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{course?.title ?? `#${r.course_id}`}</div>
                      {course?.target_audience && course.target_audience.length > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {course.target_audience.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!r.is_active}
                        onCheckedChange={() => {
                          toggleRule.mutate({
                            packageId: r.package_id,
                            courseId: r.course_id,
                            existing: r,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at
                        ? formatDistanceToNow(new Date(r.created_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBackfillRule(r)}
                          disabled={!pkg || !course || !r.is_active}
                        >
                          <Zap className="h-3.5 w-3.5 mr-1.5" /> Backfill
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(r)}
                          disabled={!r.is_active}
                        >
                          <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {backfillRule && pkgMap.get(backfillRule.package_id) && courseMap.get(backfillRule.course_id) && (
        <BackfillConfirmModal
          open={!!backfillRule}
          onOpenChange={(o) => !o && setBackfillRule(null)}
          ruleId={backfillRule.id}
          packageId={backfillRule.package_id}
          courseId={backfillRule.course_id}
          packageName={pkgMap.get(backfillRule.package_id)!.name}
          courseTitle={courseMap.get(backfillRule.course_id)!.title}
        />
      )}

      <AppModal open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AppModalContent size="md">
          <AppModalHeader>
            <AppModalTitle>Archive this rule?</AppModalTitle>
            <AppModalDescription>
              Existing enrollments will remain. New package instances will no longer auto-enrol into
              this course. Continue?
            </AppModalDescription>
          </AppModalHeader>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (archiveTarget) {
                  await archiveRule.mutateAsync(archiveTarget.id);
                }
                setArchiveTarget(null);
              }}
            >
              Archive rule
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>
    </div>
  );
}
