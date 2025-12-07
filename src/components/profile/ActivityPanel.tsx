import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Activity, 
  Calendar, 
  Clock, 
  FileText, 
  TrendingUp,
  ExternalLink,
  Building2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ActivityPanelProps {
  user: {
    user_uuid: string;
    last_sign_in_at: string | null;
    created_at: string;
    tenant_id: number | null;
  };
}

export function ActivityPanel({ user }: ActivityPanelProps) {
  const navigate = useNavigate();

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (date: string | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recent Activity */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Last Login</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(user.last_sign_in_at)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(user.last_sign_in_at)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Account Created</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(user.created_at)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Quick Links */}
        <div className="space-y-2">
          <p className="text-sm font-medium mb-3">Quick Links</p>
          
          {user.tenant_id && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => navigate(`/tenant-detail/${user.tenant_id}`)}
              >
                <Building2 className="mr-2 h-4 w-4" />
                View Tenant Dashboard
                <ExternalLink className="ml-auto h-3 w-3" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => navigate('/eos-overview')}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                View EOS Overview
                <ExternalLink className="ml-auto h-3 w-3" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => navigate('/manage-documents')}
              >
                <FileText className="mr-2 h-4 w-4" />
                View Documents
                <ExternalLink className="ml-auto h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
