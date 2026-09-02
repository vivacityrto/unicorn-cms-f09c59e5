import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ListPlus, Save, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

const SERIES = [
  "AI in Your RTO",
  "Inside VET",
  "Trainers Edge",
  "8 Critical Drivers to RTO Success",
  "Superhero Tools Unleashed",
  "The Compliance Lab",
  "CRICOS",
  "Courses",
];

const PACKAGE_OPTIONS = [
  { id: 1060, label: "Superhero" },
  { id: 1061, label: "Sidekick" },
];

const DIFFICULTY_OPTIONS = ["beginner", "intermediate", "advanced"];

type RowStatus = "pending" | "running" | "done" | "error" | "skipped";

interface ParsedRow {
  key: string;
  url: string;
  title: string;
  series: string;
  status: RowStatus;
  message?: string;
  courseId?: number;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Split a CSV line respecting simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === "\t") && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function isVimeoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return /(^|\.)vimeo\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Accepts either one URL per line, or CSV/TSV rows: url,title,series
 * A header line containing "url" is ignored.
 */
function parseInput(raw: string, defaultSeries: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  raw.split(/\r?\n/).forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (idx === 0 && /^"?url"?\s*[,\t]/i.test(trimmed)) return;

    const parts = splitCsvLine(trimmed);
    const url = (parts[0] || "").replace(/^["']|["']$/g, "");
    if (!url) return;

    const key = `${idx}-${url}`;
    const duplicate = seen.has(url);
    seen.add(url);

    rows.push({
      key,
      url,
      title: parts[1] || "",
      series: parts[2] || defaultSeries,
      status: duplicate ? "skipped" : !isVimeoUrl(url) ? "error" : "pending",
      message: duplicate
        ? "Duplicate line — skipped"
        : !isVimeoUrl(url)
          ? "Not a Vimeo URL"
          : undefined,
    });
  });
  return rows;
}

export default function AcademyBulkImportPage() {
  const navigate = useNavigate();

  const [rawInput, setRawInput] = useState("");
  const [defaultSeries, setDefaultSeries] = useState<string>("");
  const [difficulty, setDifficulty] = useState("beginner");
  const [availableToAll, setAvailableToAll] = useState(true);
  const [packageIds, setPackageIds] = useState<number[]>([]);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [running, setRunning] = useState(false);

  const preview = useMemo(() => parseInput(rawInput, defaultSeries), [rawInput, defaultSeries]);
  const list = rows ?? preview;
  const importable = list.filter((r) => r.status === "pending").length;
  const doneCount = list.filter((r) => r.status === "done").length;
  const errorCount = list.filter((r) => r.status === "error").length;

  const togglePackage = (id: number) =>
    setPackageIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const updateRow = (key: string, patch: Partial<ParsedRow>) =>
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));

  /** Resolve (or create) the training_videos row for a Vimeo URL. */
  const resolveVideo = async (
    url: string,
    fallbackTitle: string,
    folderName: string,
    userId: string | null,
  ): Promise<{ videoId: string; title: string; thumbnail: string | null }> => {
    const { data: existing, error: lookupErr } = await supabase
      .from("training_videos")
      .select("id, video_name, thumbnail")
      .eq("vimeo_url", url)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing?.id) {
      return {
        videoId: existing.id as string,
        title: fallbackTitle || (existing.video_name as string) || url,
        thumbnail: (existing.thumbnail as string) ?? null,
      };
    }

    // Best-effort metadata from Vimeo oEmbed (public/embeddable videos)
    let durationSeconds: number | null = null;
    let thumbnail: string | null = null;
    let oembedTitle: string | null = null;
    try {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const j = await res.json();
        durationSeconds = typeof j.duration === "number" ? j.duration : null;
        thumbnail = j.thumbnail_url ?? null;
        oembedTitle = j.title ?? null;
      }
    } catch { /* metadata is optional */ }

    const resolvedTitle = (fallbackTitle || oembedTitle || url).trim();

    const { data: existingFolder, error: fLookupErr } = await supabase
      .from("training_folders")
      .select("id")
      .eq("folder_name", folderName)
      .maybeSingle();
    if (fLookupErr) throw fLookupErr;

    let folderId = existingFolder?.id as string | undefined;
    if (!folderId) {
      const { data: newFolder, error: fInsErr } = await supabase
        .from("training_folders")
        .insert({ folder_name: folderName })
        .select("id")
        .single();
      if (fInsErr) throw fInsErr;
      folderId = newFolder.id as string;
    }

    const { data: newVideo, error: vInsErr } = await supabase
      .from("training_videos")
      .insert({
        folder_id: folderId,
        folder_name: folderName,
        video_name: resolvedTitle,
        vimeo_url: url,
        duration_seconds: durationSeconds,
        thumbnail,
        added_by: userId,
      })
      .select("id")
      .single();
    if (vInsErr) throw vInsErr;

    return { videoId: newVideo.id as string, title: resolvedTitle, thumbnail };
  };

  const createDraftCourse = async (
    row: ParsedRow,
    videoId: string,
    title: string,
    thumbnail: string | null,
    userId: string | null,
  ): Promise<number> => {
    let slug = generateSlug(title) || `imported-${Date.now()}`;
    const { data: slugRows } = await supabase
      .from("academy_courses")
      .select("slug")
      .ilike("slug", `${slug}%`);
    if (slugRows && slugRows.length > 0) {
      const taken = new Set(slugRows.map((r) => r.slug));
      const base = slug;
      let i = 2;
      while (taken.has(slug)) { slug = `${base}-${i}`; i++; }
    }

    const { data: course, error: cErr } = await supabase
      .from("academy_courses")
      .insert({
        title,
        slug,
        thumbnail_url: thumbnail,
        difficulty_level: difficulty,
        status: "draft",
        session_type: row.series === "The Compliance Lab" ? "workshop" : "webinar",
        webinar_series: row.series || null,
        source_video_id: videoId,
        available_to_all_clients: availableToAll,
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    const courseId = course.id as number;

    if (!availableToAll && packageIds.length > 0) {
      const { error: prErr } = await supabase
        .from("academy_package_course_rules")
        .insert(
          packageIds.map((pid) => ({ course_id: courseId, package_id: pid, is_active: true })),
        );
      if (prErr) throw prErr;
    }

    return courseId;
  };

  const handleImport = async () => {
    const parsed = parseInput(rawInput, defaultSeries);
    if (parsed.filter((r) => r.status === "pending").length === 0) {
      toast.error("Paste at least one valid Vimeo URL");
      return;
    }
    if (!availableToAll && packageIds.length === 0) {
      toast.error("Select at least one package, or choose All clients");
      return;
    }

    setRows(parsed);
    setRunning(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    let created = 0;
    let failed = 0;

    for (const row of parsed) {
      if (row.status !== "pending") continue;
      updateRow(row.key, { status: "running", message: undefined });
      try {
        const folderName = (row.series || "").trim() || "Bulk Imported Recordings";
        const { videoId, title, thumbnail } = await resolveVideo(row.url, row.title, folderName, userId);
        const courseId = await createDraftCourse(row, videoId, title, thumbnail, userId);
        created++;
        updateRow(row.key, { status: "done", courseId, title, message: "Draft created" });
      } catch (e: unknown) {
        failed++;
        updateRow(row.key, { status: "error", message: e instanceof Error ? e.message : "Failed to create draft" });
      }
    }

    setRunning(false);
    if (created > 0) {
      toast.success(`${created} draft course${created === 1 ? "" : "s"} created${failed ? ` — ${failed} failed` : ""}`);
    } else {
      toast.error("No drafts were created");
    }
  };

  const statusBadge = (row: ParsedRow) => {
    switch (row.status) {
      case "done":
        return <Badge className="bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Draft</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>;
      case "running":
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Working</Badge>;
      case "skipped":
        return <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" /> Skipped</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Ready</Badge>;
    }
  };

  return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListPlus className="h-6 w-6" style={{ color: "#7130A0" }} />
            Bulk Import Recordings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste multiple Vimeo links (or CSV rows) and create a draft course for each one.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Paste links or CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Vimeo URLs *</Label>
              <Textarea
                rows={8}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={`https://vimeo.com/1234567890\nhttps://vimeo.com/1234567891,Assessment Validation Deep Dive,Inside VET`}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                One video per line. Plain links work — or use CSV/TSV columns{" "}
                <code>url,title,series</code> to set the course title and series per row.
                A header row starting with <code>url</code> is ignored. Titles left blank are pulled
                from Vimeo where available.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Default series</Label>
                <Select value={defaultSeries || "__none__"} onValueChange={(v) => setDefaultSeries(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No series" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No series</SelectItem>
                    {SERIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Available to all clients</Label>
                  <p className="text-xs text-muted-foreground">Turn off to restrict these drafts to selected packages.</p>
                </div>
                <Switch checked={availableToAll} onCheckedChange={setAvailableToAll} />
              </div>
              {!availableToAll && (
                <div className="flex flex-wrap gap-4">
                  {PACKAGE_OPTIONS.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={packageIds.includes(p.id)} onCheckedChange={() => togglePackage(p.id)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {list.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>2. Review {list.length} row{list.length === 1 ? "" : "s"}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {importable} ready · {doneCount} created · {errorCount} failed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[38%]">URL</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Series</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-mono text-xs break-all">{r.url}</TableCell>
                      <TableCell className="text-sm">
                        {r.title || <span className="text-muted-foreground">From Vimeo</span>}
                        {r.message && (
                          <div className={`text-xs mt-1 ${r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                            {r.message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.series || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusBadge(r)}
                          {r.courseId && (
                            <Button
                              variant="link"
                              size="sm"
                              className="px-0 h-auto"
                              onClick={() => navigate(`/superadmin/academy/builder/${r.courseId}`)}
                            >
                              Open
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {errorCount > 0 && !running && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {errorCount} row{errorCount === 1 ? "" : "s"} failed. Fix the links above and run the
                    import again — rows already created are skipped because their video is reused.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleImport}
                  disabled={running || importable === 0}
                  className="text-white hover:opacity-90"
                  style={{ backgroundColor: "#7130A0" }}
                >
                  {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {running ? "Creating drafts..." : `Create ${importable} draft${importable === 1 ? "" : "s"}`}
                </Button>
                <Button variant="outline" onClick={() => navigate("/superadmin/academy/builder")}>
                  Back to Course Builder
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}
