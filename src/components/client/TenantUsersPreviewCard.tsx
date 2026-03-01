import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ChevronRight, Phone } from 'lucide-react';

interface TenantUsersPreviewCardProps {
  tenantId: number;
  onViewAll: () => void;
}

interface PreviewUser {
  user_id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
}

export function TenantUsersPreviewCard({ tenantId, onViewAll }: TenantUsersPreviewCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-users-preview', tenantId],
    queryFn: async () => {
      // Get total count
      const { count } = await supabase
        .from('tenant_users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Get first 6 users with details
      const { data: members, error } = await (supabase as any)
        .from('tenant_users')
        .select('user_id, role, users:user_id(first_name, last_name, email, avatar_url, job_title, phone)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(6);

      if (error) throw error;

      const users: PreviewUser[] = (members || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role || 'child',
        first_name: m.users?.first_name ?? null,
        last_name: m.users?.last_name ?? null,
        email: m.users?.email ?? '',
        avatar_url: m.users?.avatar_url ?? null,
        job_title: m.users?.job_title ?? null,
        phone: m.users?.phone ?? null,
      }));

      return { users, totalCount: count ?? users.length };
    },
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const users = data?.users ?? [];
  const totalCount = data?.totalCount ?? 0;

  const getRoleBadge = (role: string) => {
    if (role === 'parent') return <Badge variant="default" className="text-[10px] px-1.5 py-0">Primary</Badge>;
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0">User</Badge>;
  };

  const getInitials = (u: PreviewUser) => {
    const f = u.first_name?.[0] || '';
    const l = u.last_name?.[0] || '';
    return (f + l).toUpperCase() || u.email?.[0]?.toUpperCase() || '?';
  };

  const getName = (u: PreviewUser) => {
    if (u.first_name || u.last_name) return `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return u.email;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
            <Badge variant="outline" className="text-xs ml-1">{totalCount}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs gap-1">
            View All <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users assigned</p>
        ) : (
          users.map((u) => (
            <div key={u.user_id} className="flex items-center gap-3 py-1">
              <Avatar className="h-8 w-8 shrink-0">
                {u.avatar_url && <AvatarImage src={u.avatar_url} alt={getName(u)} />}
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(u)}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-baseline gap-2 flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getName(u)}</p>
                {u.job_title && <span className="text-xs text-muted-foreground truncate">{u.job_title}</span>}
              </div>
              {u.phone && (
                <a
                  href={`tel:${u.phone}`}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
                  title={`Call ${u.phone}`}
                >
                  <Phone className="h-3 w-3" />
                  {u.phone}
                </a>
              )}
              {getRoleBadge(u.role)}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
