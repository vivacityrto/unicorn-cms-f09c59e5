import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarPlus, ListChecks, MessageSquare } from 'lucide-react';

interface Props {
  packageInstanceId: number;
}

// TODO(week1-routes): replace with real booking route once it ships.
export function PackageActionRow({ packageInstanceId }: Props) {
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
        <Link to={`/client/tasks?package_instance_id=${packageInstanceId}`}>
          <ListChecks className="h-4 w-4 mr-1.5" />
          Open tasks
        </Link>
      </Button>

      <Button asChild size="sm" variant="secondary">
        <Link to="/client/inbox?tab=messages">
          <MessageSquare className="h-4 w-4 mr-1.5" />
          Message CSC
        </Link>
      </Button>
    </div>
  );
}
