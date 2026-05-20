import { Button } from '@/components/ui/button';
import { useHelpCenter } from '@/components/help-center';
import { ListChecks, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  packageInstanceId: number;
}

export function PackageActionRow({ packageInstanceId }: Props) {
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary">
        <Link to={`/client/tasks?package_instance_id=${packageInstanceId}`}>
          <ListChecks className="h-4 w-4 mr-1.5" />
          Open tasks
        </Link>
      </Button>

      {canAccessHelpCenter && (
        <Button size="sm" variant="secondary" onClick={() => openHelpCenter('csc')}>
          <MessageSquare className="h-4 w-4 mr-1.5" />
          Message CSC
        </Button>
      )}
    </div>
  );
}
