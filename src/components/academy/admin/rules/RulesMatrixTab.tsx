import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import {
  usePackagesActive,
  usePublishedCourses,
  useAllPackageCourseRules,
  useToggleRule,
  useBatchToggle,
  useCopyRuleMappings,
  packageTypeStyle,
  type PackageRow,
  type CourseRow,
  type RuleRow,
} from "@/hooks/academy/useAcademyPackageRules";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PACKAGE_TYPES = ["project", "membership", "regulatory_submission", "audit"] as const;
const AUDIENCE_OPTIONS = [
  { value: "trainer", label: "Trainer" },
  { value: "compliance_manager", label: "Compliance Manager" },
  { value: "governance_person", label: "Governing Person" },
  { value: "student_support_officer", label: "Student Support Officer" },
  { value: "administration_assistant", label: "Administration Assistant" },
];

type ShowMode = "all" | "mapped" | "unmapped";

export default function RulesMatrixTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { data: packages = [], isLoading: loadingP } = usePackagesActive();
  const { data: courses = [], isLoading: loadingC } = usePublishedCourses();
  const { data: rules = [], isLoading: loadingR } = useAllPackageCourseRules();
  const toggleRule = useToggleRule();
  const batchToggle = useBatchToggle();
  const copyMappings = useCopyRuleMappings();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(PACKAGE_TYPES));
  const [audienceFilter, setAudienceFilter] = useState<Set<string>>(
    new Set(AUDIENCE_OPTIONS.map((a) => a.value))
  );
  const [show, setShow] = useState<ShowMode>("all");

  const [bulkRowOpen, setBulkRowOpen] = useState(false);
  const [bulkColOpen, setBulkColOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  // Quick lookup for rules
  const ruleMap = useMemo(() => {
    const m = new Map<string, RuleRow>();
    rules.forEach((r) => m.set(`${r.package_id}:${r.course_id}`, r));
    return m;
  }, [rules]);

  const isCellActive = useCallback((pkgId: number, courseId: number) => {
    const r = ruleMap.get(`${pkgId}:${courseId}`);
    return !!r?.is_active;
  }, [ruleMap]);

  // Filter packages
  const filteredPackages = useMemo(() => {
    return packages
      .filter((p) => typeFilter.has(p.package_type ?? ""))
      .filter((p) =>
        search ? p.name.toLowerCase().includes(search.toLowerCase()) : true
      );
  }, [packages, typeFilter, search]);

  // Filter courses
  const filteredCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (!c.target_audience || c.target_audience.length === 0) return true;
        return c.target_audience.some((a) => audienceFilter.has(a));
      })
      .filter((c) =>
        search ? c.title.toLowerCase().includes(search.toLowerCase()) : true
      )
      .filter((c) => {
        if (show === "all") return true;
        const hasAny = filteredPackages.some((p) => isCellActive(p.id, c.id));
        return show === "mapped" ? hasAny : !hasAny;
      });
  }, [courses, audienceFilter, search, show, filteredPackages, isCellActive]);

  // Group packages by type for column header bands
  const packagesByType = useMemo(() => {
    const groups: Record<string, PackageRow[]> = {};
    filteredPackages.forEach((p) => {
      const t = p.package_type ?? "other";
      if (!groups[t]) groups[t] = [];
      groups[t].push(p);
    });
    return groups;
  }, [filteredPackages]);

  const handleCellClick = (pkg: PackageRow, course: CourseRow) => {
    const existing = ruleMap.get(`${pkg.id}:${course.id}`) ?? null;
    toggleRule.mutate({
      packageId: pkg.id,
      courseId: course.id,
      existing,
    });
  };

  const toggleSetItem = (set: Set<string>, item: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setter(next);
  };

  const isLoading = loadingP || loadingC || loadingR;
  const hasNoRules = rules.length === 0 && !isLoading;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses or packages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-72"
            />
          </div>

          {/* Package type filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Package types ({typeFilter.size})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PACKAGE_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleSetItem(typeFilter, t, setTypeFilter);
                  }}
                  className="gap-2"
                >
                  <Checkbox checked={typeFilter.has(t)} />
                  <span>{packageTypeStyle(t).label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Audience filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Audience ({audienceFilter.size})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {AUDIENCE_OPTIONS.map((a) => (
                <DropdownMenuItem
                  key={a.value}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleSetItem(audienceFilter, a.value, setAudienceFilter);
                  }}
                  className="gap-2"
                >
                  <Checkbox checked={audienceFilter.has(a.value)} />
                  <span>{a.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Show mode */}
          <Select value={show} onValueChange={(v) => setShow(v as ShowMode)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Show: All</SelectItem>
              <SelectItem value="mapped">Mapped only</SelectItem>
              <SelectItem value="unmapped">Unmapped only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk actions */}
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkRowOpen(true)}>
              Select row…
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkColOpen(true)}>
              Select column…
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy mappings…
            </Button>
          </div>
        )}
      </div>

      {hasNoRules && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          No mappings yet. Click any cell to create your first rule, or use quick-add.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="border rounded-lg overflow-auto max-h-[70vh] relative">
            <table className="border-collapse text-sm">
              <thead>
                {/* Type band row */}
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-background border-b border-r min-w-[280px]" />
                  {Object.entries(packagesByType).map(([type, pkgs]) => {
                    const style = packageTypeStyle(type);
                    return (
                      <th
                        key={type}
                        colSpan={pkgs.length}
                        className={`sticky top-0 z-20 px-2 py-1 text-xs font-semibold border-b border-r text-foreground ${style.band}`}
                      >
                        {style.label}
                      </th>
                    );
                  })}
                </tr>
                {/* Package name row */}
                <tr>
                  <th className="sticky top-7 left-0 z-30 bg-background border-b border-r px-3 py-2 text-left font-semibold text-secondary min-w-[280px]">
                    Course
                  </th>
                  {Object.values(packagesByType).flat().map((p) => (
                    <th
                      key={p.id}
                      className="sticky top-7 z-10 bg-background border-b border-r px-2 py-2 text-left align-bottom min-w-[140px] max-w-[140px]"
                    >
                      <div className="text-xs font-medium text-foreground line-clamp-2">
                        {p.name}
                      </div>
                      {p.duration_months ? (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {p.duration_months}mo
                        </div>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((course, rowIdx) => (
                  <tr
                    key={course.id}
                    className={rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  >
                    <td
                      className={`sticky left-0 z-10 border-r border-b px-3 py-2 min-w-[280px] ${
                        rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                      }`}
                    >
                      <div className="font-medium text-sm text-foreground">{course.title}</div>
                      {course.target_audience && course.target_audience.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {course.target_audience.join(", ")}
                        </div>
                      )}
                    </td>
                    {Object.values(packagesByType).flat().map((p) => {
                      const active = isCellActive(p.id, course.id);
                      return (
                        <td
                          key={p.id}
                          className="border-r border-b text-center p-0"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={readOnly ? undefined : () => handleCellClick(p, course)}
                                disabled={readOnly}
                                className={`w-full h-full min-h-[40px] flex items-center justify-center transition-colors ${readOnly ? "cursor-default" : "hover:bg-primary/10"}`}
                                aria-label={
                                  active
                                    ? `${readOnly ? "Mapped" : "Disable"}: ${course.title} for ${p.name}`
                                    : `${readOnly ? "Not mapped" : "Enable"}: ${course.title} for ${p.name}`
                                }
                              >
                                {active ? (
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground">
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-block h-5 w-5 rounded border border-border" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {active
                                ? `Click to disable auto-enrol for ${course.title} when ${p.name} is assigned`
                                : `Click to enable auto-enrol for ${course.title} when ${p.name} is assigned`}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredCourses.length === 0 && (
                  <tr>
                    <td colSpan={filteredPackages.length + 1} className="text-center text-muted-foreground p-8">
                      No courses match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

      {/* Bulk: select row (course) */}
      <BulkSelectModal
        open={bulkRowOpen}
        onOpenChange={setBulkRowOpen}
        title="Bulk-select packages for one course"
        primaryItems={courses}
        primaryLabel={(c) => c.title}
        secondaryItems={packages}
        secondaryLabel={(p) => p.name}
        onConfirm={async (primaryId, secondaryIds, activate) => {
          await batchToggle.mutateAsync({
            pairs: secondaryIds.map((sid) => ({
              packageId: sid as number,
              courseId: primaryId as number,
            })),
            activate,
          });
        }}
      />

      {/* Bulk: select column (package) */}
      <BulkSelectModal
        open={bulkColOpen}
        onOpenChange={setBulkColOpen}
        title="Bulk-select courses for one package"
        primaryItems={packages}
        primaryLabel={(p) => p.name}
        secondaryItems={courses}
        secondaryLabel={(c) => c.title}
        onConfirm={async (primaryId, secondaryIds, activate) => {
          await batchToggle.mutateAsync({
            pairs: secondaryIds.map((sid) => ({
              packageId: primaryId as number,
              courseId: sid as number,
            })),
            activate,
          });
        }}
      />

      {/* Copy mappings */}
      <CopyMappingsModal
        open={copyOpen}
        onOpenChange={setCopyOpen}
        packages={packages}
        onConfirm={async (sourceId, targetId) => {
          await copyMappings.mutateAsync({ sourcePackageId: sourceId, targetPackageId: targetId });
        }}
      />
    </div>
  );
}

// ============= Bulk select modal =============

interface BulkSelectModalProps<P, S> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  primaryItems: P[];
  primaryLabel: (p: P) => string;
  secondaryItems: S[];
  secondaryLabel: (s: S) => string;
  onConfirm: (primaryId: number, secondaryIds: number[], activate: boolean) => Promise<void>;
}

function BulkSelectModal<P extends { id: number }, S extends { id: number }>({
  open,
  onOpenChange,
  title,
  primaryItems,
  primaryLabel,
  secondaryItems,
  secondaryLabel,
  onConfirm,
}: BulkSelectModalProps<P, S>) {
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<Set<number>>(new Set());
  const [activate, setActivate] = useState(true);
  const [search, setSearch] = useState("");

  const handleClose = (o: boolean) => {
    if (!o) {
      setPrimaryId(null);
      setSecondaryIds(new Set());
      setActivate(true);
      setSearch("");
    }
    onOpenChange(o);
  };

  const filteredSecondary = secondaryItems.filter((s) =>
    secondaryLabel(s).toLowerCase().includes(search.toLowerCase())
  );

  const submit = async () => {
    if (!primaryId || secondaryIds.size === 0) return;
    await onConfirm(primaryId, Array.from(secondaryIds), activate);
    handleClose(false);
  };

  return (
    <AppModal open={open} onOpenChange={handleClose}>
      <AppModalContent size="2xl">
        <AppModalHeader>
          <AppModalTitle>{title}</AppModalTitle>
        </AppModalHeader>
        <AppModalBody>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">Choose</label>
              <Select
                value={primaryId?.toString() ?? ""}
                onValueChange={(v) => setPrimaryId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {primaryItems.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {primaryLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {primaryId && (
              <>
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex items-center justify-between px-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={
                        filteredSecondary.length > 0 &&
                        filteredSecondary.every((s) => secondaryIds.has(s.id))
                      }
                      onCheckedChange={(checked) => {
                        setSecondaryIds((prev) => {
                          const n = new Set(prev);
                          if (checked) filteredSecondary.forEach((s) => n.add(s.id));
                          else filteredSecondary.forEach((s) => n.delete(s.id));
                          return n;
                        });
                      }}
                    />
                    Select all{search ? " (filtered)" : ""}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {secondaryIds.size} selected
                  </span>
                </div>
                <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                  {filteredSecondary.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={secondaryIds.has(s.id)}
                        onCheckedChange={() => {
                          setSecondaryIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(s.id)) n.delete(s.id);
                            else n.add(s.id);
                            return n;
                          });
                        }}
                      />
                      <span className="text-sm">{secondaryLabel(s)}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-4 items-center text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={activate}
                      onChange={() => setActivate(true)}
                    />
                    Enable
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!activate}
                      onChange={() => setActivate(false)}
                    />
                    Disable
                  </label>
                </div>
              </>
            )}
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!primaryId || secondaryIds.size === 0}>
            Apply ({secondaryIds.size})
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

// ============= Copy mappings modal =============

function CopyMappingsModal({
  open,
  onOpenChange,
  packages,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packages: PackageRow[];
  onConfirm: (sourceId: number, targetId: number) => Promise<void>;
}) {
  const [source, setSource] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const handleClose = (o: boolean) => {
    if (!o) {
      setSource(null);
      setTarget(null);
    }
    onOpenChange(o);
  };

  const submit = async () => {
    if (!source || !target || source === target) return;
    await onConfirm(source, target);
    handleClose(false);
  };

  return (
    <AppModal open={open} onOpenChange={handleClose}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Copy mappings between packages</AppModalTitle>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">From package</label>
              <Select value={source?.toString() ?? ""} onValueChange={(v) => setSource(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">To package</label>
              <Select value={target?.toString() ?? ""} onValueChange={(v) => setTarget(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Target…" /></SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            All active rules from the source package will be copied or reactivated on the target.
          </p>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!source || !target || source === target}>
            Copy mappings
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
