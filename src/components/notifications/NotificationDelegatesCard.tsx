import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationDelegates } from '@/hooks/useNotificationDelegates';

const ALL_CSCS = '__all_csc__';

/**
 * Assistants. An assistant hears about the clients of the person they assist, so an
 * assistant to a consultant sees that consultant's client messages and tickets.
 * Super Admins manage anyone's links; a CSC manages their own.
 */
export function NotificationDelegatesCard() {
  const { profile } = useAuth();
  const { staff, links, isLoading, create, end } = useNotificationDelegates();
  const [delegateId, setDelegateId] = useState('');
  const [principal, setPrincipal] = useState('');

  const me = profile?.user_uuid ?? '';
  const role = String(profile?.unicorn_role ?? '');
  const isSuperAdmin = role === 'Super Admin';
  const isCsc = role === 'CSC';
  // Anyone else has nothing to manage, and sees links only if they are part of one.
  const canAdd = isSuperAdmin || isCsc;
  const effectivePrincipal = isSuperAdmin ? principal : me;

  const submit = () => {
    if (!delegateId || !effectivePrincipal) return;
    create.mutate(
      {
        principalKind: effectivePrincipal === ALL_CSCS ? 'all_csc' : 'user',
        principalUserId: effectivePrincipal === ALL_CSCS ? null : effectivePrincipal,
        delegateUserId: delegateId,
      },
      {
        onSuccess: () => {
          setDelegateId('');
          setPrincipal('');
        },
      },
    );
  };

  const canEnd = (link: (typeof links)[number]): boolean =>
    isSuperAdmin || (link.principal_kind === 'user' && link.principal_user_id === me);

  if (!canAdd && !isLoading && links.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Assistants</CardTitle>
        <CardDescription>
          An assistant is told about the clients of the person they assist, in the same way that person is.
          {isSuperAdmin
            ? ' You can add or end any link.'
            : isCsc
              ? ' You can add or end assistants for your own clients.'
              : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Assistant</span>
              <Select value={delegateId} onValueChange={setDelegateId}>
                <SelectTrigger className="h-9 w-56" aria-label="Assistant">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {staff
                    .filter((s) => s.userId !== effectivePrincipal)
                    .map((s) => (
                      <SelectItem key={s.userId} value={s.userId}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Assists</span>
                <Select value={principal} onValueChange={setPrincipal}>
                  <SelectTrigger className="h-9 w-56" aria-label="Person assisted">
                    <SelectValue placeholder="Choose who they assist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CSCS}>Every CSC</SelectItem>
                    {staff
                      .filter((s) => s.userId !== delegateId)
                      .map((s) => (
                        <SelectItem key={s.userId} value={s.userId}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={submit} disabled={!delegateId || !effectivePrincipal || create.isPending}>
              <UserPlus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assistant links yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-2 p-2 pl-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{link.delegateName}</span>
                  <span className="text-muted-foreground"> assists </span>
                  <span className="font-medium">{link.principalName}</span>
                  <span className="text-muted-foreground">
                    {link.tenantName ? ` for ${link.tenantName}` : ''}
                  </span>
                  {link.categories && link.categories.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {link.categories.length} categor{link.categories.length === 1 ? 'y' : 'ies'}
                    </Badge>
                  )}
                </div>
                {canEnd(link) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label={`End ${link.delegateName}'s assistant link`}
                    onClick={() => end.mutate(link.id)}
                    disabled={end.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
