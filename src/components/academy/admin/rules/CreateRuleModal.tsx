import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  usePackagesActive,
  usePublishedCourses,
  useCreateRules,
  packageTypeStyle,
} from "@/hooks/academy/useAcademyPackageRules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateRuleModal({ open, onOpenChange }: Props) {
  const { data: packages = [] } = usePackagesActive();
  const { data: courses = [] } = usePublishedCourses();
  const createRules = useCreateRules();

  const [pkgSearch, setPkgSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<Set<number>>(new Set());
  const [backfill, setBackfill] = useState(false);

  const filteredPackages = useMemo(
    () =>
      packages.filter((p) =>
        p.name.toLowerCase().includes(pkgSearch.toLowerCase())
      ),
    [packages, pkgSearch]
  );
  const filteredCourses = useMemo(
    () =>
      courses.filter((c) =>
        c.title.toLowerCase().includes(courseSearch.toLowerCase())
      ),
    [courses, courseSearch]
  );

  const reset = () => {
    setPkgSearch("");
    setCourseSearch("");
    setSelectedPkg(null);
    setSelectedCourses(new Set());
    setBackfill(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    if (!selectedPkg || selectedCourses.size === 0) return;
    await createRules.mutateAsync({
      packageId: selectedPkg,
      courseIds: Array.from(selectedCourses),
      backfill,
    });
    handleClose(false);
  };

  const toggleCourse = (cid: number) => {
    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  };

  return (
    <AppModal open={open} onOpenChange={handleClose}>
      <AppModalContent size="2xl">
        <AppModalHeader>
          <AppModalTitle>New rule</AppModalTitle>
          <AppModalDescription>
            Map one package to one or more Academy courses. Future package instances will auto-enrol.
          </AppModalDescription>
        </AppModalHeader>
        <AppModalBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Package picker */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Package</Label>
              <Input
                placeholder="Search packages…"
                value={pkgSearch}
                onChange={(e) => setPkgSearch(e.target.value)}
              />
              <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                {filteredPackages.map((p) => {
                  const style = packageTypeStyle(p.package_type);
                  const isSelected = selectedPkg === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-2 ${
                        isSelected ? "bg-primary/10" : ""
                      }`}
                      onClick={() => setSelectedPkg(p.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.duration_months ? (
                          <p className="text-xs text-muted-foreground">
                            {p.duration_months} months
                          </p>
                        ) : null}
                      </div>
                      <Badge className={style.chip} variant="secondary">
                        {style.label}
                      </Badge>
                    </button>
                  );
                })}
                {filteredPackages.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No packages match.</p>
                )}
              </div>
            </div>

            {/* Course multi-picker */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Courses {selectedCourses.size > 0 && `(${selectedCourses.size} selected)`}
              </Label>
              <Input
                placeholder="Search courses…"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
              />
              <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                {filteredCourses.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedCourses.has(c.id)}
                      onCheckedChange={() => toggleCourse(c.id)}
                    />
                    <span className="text-sm flex-1 truncate">{c.title}</span>
                  </label>
                ))}
                {filteredCourses.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No courses match.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 p-4 rounded-lg bg-muted/40 border">
            <Checkbox
              id="backfill-existing"
              checked={backfill}
              onCheckedChange={(v) => setBackfill(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="backfill-existing" className="text-sm font-medium cursor-pointer">
                Backfill existing clients?
              </Label>
              <p className="text-xs text-muted-foreground">
                If enabled, enrols all existing active package holders immediately. Otherwise, only
                new package instances will be auto-enrolled.
              </p>
            </div>
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={createRules.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPkg || selectedCourses.size === 0 || createRules.isPending}
          >
            {createRules.isPending ? "Creating…" : `Create ${selectedCourses.size || ""} rules`}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
