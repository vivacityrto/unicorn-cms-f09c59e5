import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { AlertTriangle, Copy, RefreshCcw } from 'lucide-react';
import {
  useAdminZeroProgressPackages,
  type ZeroProgressPackageRow,
  type ZeroProgressTriage,
} from '@/hooks/use-admin-zero-progress-packages';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

const TRIAGE_ORDER: ZeroProgressTriage[] = ['investigate', 'review', 'dormant', 'pre_release'];

const TRIAGE_LABEL: Record<ZeroProgressTriage, string> = {
  investigate: 'Investigate',
  review: 'Review',
  dormant: 'Dormant',
  pre_release: 'Pre-release',
};

const TRIAGE_DESC: Record<ZeroProgressTriage, string> = {
  investigate: 'Active work, no stage progress',
  review: 'Worth a glance',
  dormant: 'No activity in 90+ days',
  pre_release: 'Onboarding, not yet started',
};

const TRIAGE_BADGE_CLASS: Record<ZeroProgressTriage, string> = {
  investigate: 'bg-destructive/15 text-destructive border-destructive/30',
  review: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  dormant: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  pre_release: 'bg-muted text-muted-foreground border-border',
};

const TRIAGE_TILE_CLASS: Record<ZeroProgressTriage, string> = {
  investigate: 'border-destructive/40',
  review: 'border-amber-500/40',
  dormant: 'border-slate-500/30',
  pre_release: 'border-border',
};

function formatHours(decimalHours: number): string {
  if (!decimalHours || decimalHours <= 0) return '0:00';
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function isEpoch(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const d = parseISO(iso);
  if (!isValid(d)) return true;
  return d.getUTCFullYear() <= 1970;
}

type SortKey =
  | 'tenant_name'
  | 'package_name'
  | 'start_date'
  | 'days_since_start'
  | 'stages_total'
  | 'tasks_done'
  | 'hours_logged'
  | 'last_activity_at'
  | 'triage_category';

export default function AdminZeroProgressPackagesPage() {
  const { data, isLoading, error, refetch, isFetching } = useAdminZeroProgressPackages();
  const { toast } = useToast();

  const [enabledTriage, setEnabledTriage] = useState<Record<ZeroProgressTriage, boolean>>({
    investigate: true,
    review: true,
    dormant: true,
    pre_release: false,
  });
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<ZeroProgressTriage, number> = {
      investigate: 0,
      review: 0,
      dormant: 0,
      pre_release: 0,
    };
    for (const r of rows) c[r.triage_category]++;
    return c;
  }, [rows]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.manager_id) set.add(r.manager_id);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!enabledTriage[r.triage_category]) return false;
      if (managerFilter !== 'all') {
        if (managerFilter === '__none__' && r.manager_id) return false;
        if (managerFilter !== '__none__' && r.manager_id !== managerFilter) return false;
      }
      if (q) {
        const t = (r.tenant_name ?? '').toLowerCase();
        const l = (r.tenant_legal_name ?? '').toLowerCase();
        if (!t.includes(q) && !l.includes(q)) return false;
      }
      return true;
    });
  }, [rows, enabledTriage, managerFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const tasksDoneA = a.action_items_completed + a.legacy_tasks_completed;
      const tasksDoneB = b.action_items_completed + b.legacy_tasks_completed;
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'tenant_name': av = a.tenant_name ?? ''; bv = b.tenant_name ?? ''; break;
        case 'package_name': av = a.package_name ?? ''; bv = b.package_name ?? ''; break;
        case 'start_date': av = a.start_date ?? ''; bv = b.start_date ?? ''; break;
        case 'days_since_start': av = a.days_since_start; bv = b.days_since_start; break;
        case 'stages_total': av = a.stages_total; bv = b.stages_total; break;
        case 'tasks_done': av = tasksDoneA; bv = tasksDoneB; break;
        case 'hours_logged': av = a.hours_logged; bv = b.hours_logged; break;
        case 'last_activity_at': av = a.last_activity_at ?? ''; bv = b.last_activity_at ?? ''; break;
        case 'triage_category':
          av = TRIAGE_ORDER.indexOf(a.triage_category);
          bv = TRIAGE_ORDER.indexOf(b.triage_category);
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'tenant_name' || key === 'package_name' ? 'asc' : 'desc');
    }
  };

  const copyTSV = async () => {
    const headers = [
      'Tenant', 'Tenant legal', 'Package', 'Package type', 'Started', 'Days',
      'Stages complete', 'Stages total',
      'Action items done', 'Legacy tasks done', 'Hours', 'Last activity', 'Triage',
    ];
    const lines = [headers.join('\t')];
    for (const r of sorted) {
      lines.push([
        r.tenant_name ?? '',
        r.tenant_legal_name ?? '',
        r.package_name ?? '',
        r.package_type ?? '',
        r.start_date ?? '',
        String(r.days_since_start ?? ''),
        String(r.stages_complete),
        String(r.stages_total),
        String(r.action_items_completed),
        String(r.legacy_tasks_completed),
        formatHours(Number(r.hours_logged ?? 0)),
        r.last_activity_at ?? '',
        r.triage_category,
      ].join('\t'));
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ title: 'Copied', description: `${sorted.length} rows copied as TSV.` });
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard unavailable.', variant: 'destructive' });
    }
  };

  const renderRow = (r: ZeroProgressPackageRow) => {
    const tasksDone = r.action_items_completed + r.legacy_tasks_completed;
    const epoch = isEpoch(r.last_activity_at);
    const startedFormatted = (() => {
      if (!r.start_date) return '—';
      const d = parseISO(r.start_date);
      return isValid(d) ? format(d, 'd MMM yyyy') : '—';
    })();
    return (
      <TableRow key={r.package_instance_id}>
        <TableCell>
          <Link to={`/tenant/${r.tenant_id}`} className="text-primary hover:underline font-medium">
            {r.tenant_name}
          </Link>
          {r.tenant_legal_name && r.tenant_legal_name !== r.tenant_name && (
            <div className="text-xs text-muted-foreground truncate max-w-[240px]">{r.tenant_legal_name}</div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span>{r.package_name}</span>
            {r.package_type && (
              <Badge variant="outline" className="text-xs">{r.package_type}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{startedFormatted}</TableCell>
        <TableCell className="text-right font-mono tabular-nums">{r.days_since_start}</TableCell>
        <TableCell className="font-mono tabular-nums">
          {r.stages_complete}/{r.stages_total}
        </TableCell>
        <TableCell className={tasksDone > 0 ? 'font-bold' : 'text-muted-foreground'}>
          {tasksDone}
        </TableCell>
        <TableCell className="font-mono tabular-nums">{formatHours(Number(r.hours_logged ?? 0))}</TableCell>
        <TableCell className="text-muted-foreground">
          {epoch ? '—' : `${formatDistanceToNow(parseISO(r.last_activity_at))} ago`}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={TRIAGE_BADGE_CLASS[r.triage_category]}>
            {TRIAGE_LABEL[r.triage_category]}
          </Badge>
        </TableCell>
      </TableRow>
    );
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <PageHeader
        icon={AlertTriangle}
        title="Zero-progress active packages"
        description="Active packages 60+ days old with stages_complete = 0. Triage before launch."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TRIAGE_ORDER.map((cat) => (
          <Card key={cat} className={TRIAGE_TILE_CLASS[cat]}>
            <CardContent className="p-4">
              <div className="text-3xl font-bold tabular-nums">{counts[cat]}</div>
              <div className="text-sm font-medium mt-1">{TRIAGE_LABEL[cat]}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{TRIAGE_DESC[cat]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Triage: {TRIAGE_ORDER.filter((t) => enabledTriage[t]).length} selected
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Show categories</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TRIAGE_ORDER.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={enabledTriage[t]}
                onCheckedChange={(v) => setEnabledTriage((s) => ({ ...s, [t]: !!v }))}
              >
                {TRIAGE_LABEL[t]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={managerFilter} onValueChange={setManagerFilter}>
          <SelectTrigger className="w-full md:w-[260px]">
            <SelectValue placeholder="Filter by CSC / manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All managers</SelectItem>
            <SelectItem value="__none__">No manager assigned</SelectItem>
            {managerOptions.map((id) => (
              <SelectItem key={id} value={id}>
                {id.slice(0, 8)}…
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search tenant name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:w-[280px]"
        />

        <div className="md:ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{sorted.length} rows</span>
          <Button variant="outline" size="sm" onClick={copyTSV} disabled={sorted.length === 0}>
            <Copy className="h-4 w-4 mr-2" />
            Copy TSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Failed to load</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{error instanceof Error ? error.message : 'Unknown error'}</span>
                <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('tenant_name')} className="cursor-pointer select-none">Tenant{sortIndicator('tenant_name')}</TableHead>
                  <TableHead onClick={() => handleSort('package_name')} className="cursor-pointer select-none">Package{sortIndicator('package_name')}</TableHead>
                  <TableHead onClick={() => handleSort('start_date')} className="cursor-pointer select-none">Started{sortIndicator('start_date')}</TableHead>
                  <TableHead onClick={() => handleSort('days_since_start')} className="cursor-pointer select-none text-right">Days{sortIndicator('days_since_start')}</TableHead>
                  <TableHead onClick={() => handleSort('stages_total')} className="cursor-pointer select-none">Stages{sortIndicator('stages_total')}</TableHead>
                  <TableHead onClick={() => handleSort('tasks_done')} className="cursor-pointer select-none">Tasks done{sortIndicator('tasks_done')}</TableHead>
                  <TableHead onClick={() => handleSort('hours_logged')} className="cursor-pointer select-none">Hours{sortIndicator('hours_logged')}</TableHead>
                  <TableHead onClick={() => handleSort('last_activity_at')} className="cursor-pointer select-none">Last activity{sortIndicator('last_activity_at')}</TableHead>
                  <TableHead onClick={() => handleSort('triage_category')} className="cursor-pointer select-none">Triage{sortIndicator('triage_category')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No zero-progress packages match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map(renderRow)
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
