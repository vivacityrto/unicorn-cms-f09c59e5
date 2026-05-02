import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarPlus, ListChecks, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  packageInstanceId: number;
  managerId: string | null;
}

// TODO(week1-routes): replace with real booking + tasks-by-package + CSC-message routes
// once they ship. These stubs match the placeholders agreed in the plan.
export function PackageActionRow({ packageInstanceId, managerId }: Props) {
  const [managerEmail, setManagerEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!managerId) { setManagerEmail(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('users')
        .select('email')
        .eq('user_uuid', managerId)
        .maybeSingle();
      setManagerEmail((data?.email as string | undefined) ?? null);
    })();
  }, [managerId]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        {/* TODO(week1-routes): real booking flow */}
        <Link to={`/consults/new?package_instance_id=${packageInstanceId}`}>
          <CalendarPlus className="h-4 w-4 mr-1.5" />
          Book consult
        </Link>
      </Button>

      <Button asChild size="sm" variant="secondary">
        {/* TODO(week1-routes): tasks filter by package */}
        <Link to={`/tasks?package_instance_id=${packageInstanceId}`}>
          <ListChecks className="h-4 w-4 mr-1.5" />
          Open tasks
        </Link>
      </Button>

      {/* TODO(week1-routes): replace mailto with in-app CSC-message drawer */}
      <Button
        asChild={!!managerEmail}
        size="sm"
        variant="secondary"
        disabled={!managerEmail}
        title={managerEmail ? `Email ${managerEmail}` : 'No CSC email on file'}
      >
        {managerEmail ? (
          <a href={`mailto:${managerEmail}?subject=Package%20${packageInstanceId}`}>
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Message CSC
          </a>
        ) : (
          <span>
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Message CSC
          </span>
        )}
      </Button>
    </div>
  );
}
