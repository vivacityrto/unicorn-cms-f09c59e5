import { useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClientNotificationOverrides,
  useTenantSearch,
  type OverrideMode,
} from '@/hooks/useClientNotificationOverrides';

/** Watch a client you do not own, or mute one you do. This beats your category settings for that client. */
export function ClientNotificationOverridesCard() {
  const { overrides, isLoading, set, remove } = useClientNotificationOverrides();
  const [term, setTerm] = useState('');
  const search = useTenantSearch(term);

  const add = (tenantId: number, mode: OverrideMode) => {
    set.mutate({ tenantId, mode }, { onSuccess: () => setTerm('') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Specific clients</CardTitle>
        <CardDescription>
          Watch a client you do not own to hear about them, or mute a client you do own. This overrides your
          settings above for that client only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Find a client by name"
              aria-label="Find a client by name"
              className="pl-8"
            />
          </div>
          {term.trim().length >= 2 && (
            <div className="rounded-md border divide-y">
              {search.isLoading && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
              {!search.isLoading && (search.data ?? []).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No clients match.</p>
              )}
              {(search.data ?? []).map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between gap-2 p-2 pl-3">
                  <span className="truncate text-sm">{tenant.name}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => add(tenant.id, 'watch')} disabled={set.isPending}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Watch
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => add(tenant.id, 'mute')} disabled={set.isPending}>
                      <EyeOff className="mr-1 h-3.5 w-3.5" /> Mute
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : overrides.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not watched or muted any specific client.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {overrides.map((o) => (
              <li key={o.tenantId} className="flex items-center justify-between gap-2 p-2 pl-3">
                <span className="truncate text-sm">{o.tenantName}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={o.mode === 'watch' ? 'default' : 'secondary'}>
                    {o.mode === 'watch' ? 'Watching' : 'Muted'}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Remove ${o.tenantName}`}
                    onClick={() => remove.mutate(o.tenantId)}
                    disabled={remove.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
