import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Calendar, 
  Clock, 
  Linkedin, 
  Mail, 
  Phone, 
  MapPin,
  Briefcase,
  Globe,
  ExternalLink,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CSCProfile {
  user_uuid: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  bio: string | null;
  timezone: string | null;
  linkedin_url: string | null;
  booking_url: string | null;
  working_days: string[] | null;
  working_hours: { start: string; end: string } | null;
  availability_note: string | null;
  public_holiday_region: string | null;
  avatar_url: string | null;
  is_primary: boolean;
  role_label: string;
  leave_from: string | null;
  leave_to: string | null;
  away_message: string | null;
  cover_user_id: string | null;
  cover_first_name: string | null;
  cover_last_name: string | null;
  cover_email: string | null;
}

interface CSCProfileCardProps {
  tenantId?: number;
  compact?: boolean;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export function CSCProfileCard({ tenantId, compact = false }: CSCProfileCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cscProfiles, setCscProfiles] = useState<CSCProfile[]>([]);

  useEffect(() => {
    fetchCSCProfiles();
  }, [tenantId]);

  const fetchCSCProfiles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_tenant_csc_profiles', {
        p_tenant_id: tenantId || null,
      });

      if (error) throw error;
      
      // Transform the response to match our interface
      const profiles = (data || []).map((item: any) => ({
        ...item,
        working_days: Array.isArray(item.working_days) ? item.working_days : null,
        working_hours: item.working_hours && typeof item.working_hours === 'object' 
          ? item.working_hours as { start: string; end: string }
          : null,
      })) as CSCProfile[];
      setCscProfiles(profiles);
    } catch (error: any) {
      console.error('Error fetching CSC profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Your Client Success Champion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (cscProfiles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Your Client Success Champion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No CSC has been assigned to your organization yet. Please contact support for assistance.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Get primary CSC first
  const primaryCSC = cscProfiles.find(p => p.is_primary) || cscProfiles[0];
  const backupCSCs = cscProfiles.filter(p => p.user_uuid !== primaryCSC.user_uuid);

  const formatWorkingDays = (days: string[] | null) => {
    if (!days || days.length === 0) return null;
    return days.map(d => DAY_LABELS[d] || d).join(', ');
  };

  const formatWorkingHours = (hours: { start: string; end: string } | null) => {
    if (!hours) return null;
    return `${hours.start} - ${hours.end}`;
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'CSC';
  };

  const isOnLeave = (csc: CSCProfile) => {
    if (!csc.leave_from || !csc.leave_to) return false;
    const now = new Date();
    const from = new Date(csc.leave_from);
    const to = new Date(csc.leave_to);
    return now >= from && now <= to;
  };

  const formatLeaveDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const renderCSCCard = (csc: CSCProfile, isPrimary: boolean) => {
    const onLeave = isOnLeave(csc);
    
    return (
    <div key={csc.user_uuid} className="space-y-4">
      {/* Leave Status Banner */}
      {onLeave && (
        <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>{csc.first_name} is away</strong>
            {csc.leave_to && ` until ${formatLeaveDate(csc.leave_to)}`}
            {csc.away_message && <span className="block text-sm mt-1">{csc.away_message}</span>}
            {csc.cover_first_name && csc.cover_last_name && (
              <span className="flex items-center gap-1 mt-2 text-sm">
                <UserCheck className="h-3 w-3" />
                Cover contact: <strong>{csc.cover_first_name} {csc.cover_last_name}</strong>
                {csc.cover_email && (
                  <a href={`mailto:${csc.cover_email}`} className="text-primary hover:underline ml-1">
                    ({csc.cover_email})
                  </a>
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Header with avatar and name */}
      <div className="flex items-start gap-4">
        <Avatar className={`h-16 w-16 border-2 ${onLeave ? 'border-amber-300 opacity-75' : 'border-primary/20'}`}>
          <AvatarImage src={csc.avatar_url || undefined} />
          <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
            {getInitials(csc.first_name, csc.last_name)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">
              {csc.first_name} {csc.last_name}
            </h3>
            {isPrimary && (
              <Badge variant="default" className="text-xs">Primary</Badge>
            )}
            {!isPrimary && (
              <Badge variant="outline" className="text-xs">Backup</Badge>
            )}
            {onLeave && (
              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">Away</Badge>
            )}
          </div>
          
          {csc.job_title && (
            <p className="text-muted-foreground text-sm">{csc.job_title}</p>
          )}
          
          {csc.bio && !compact && (
            <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{csc.bio}</p>
          )}
        </div>
      </div>

      {/* Contact info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {csc.email && (
          <a 
            href={`mailto:${csc.email}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{csc.email}</span>
          </a>
        )}
        
        {csc.phone && (
          <a 
            href={`tel:${csc.phone}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Phone className="h-4 w-4 flex-shrink-0" />
            <span>{csc.phone}</span>
          </a>
        )}
        
        {csc.timezone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4 flex-shrink-0" />
            <span>{csc.timezone.replace(/_/g, ' ').split('/').pop()}</span>
          </div>
        )}
        
        {csc.public_holiday_region && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>Holidays: {csc.public_holiday_region}</span>
          </div>
        )}
      </div>

      {/* Working schedule */}
      {!compact && (csc.working_days || csc.working_hours) && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            Working Hours
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            {formatWorkingDays(csc.working_days) && (
              <p>{formatWorkingDays(csc.working_days)}</p>
            )}
            {formatWorkingHours(csc.working_hours) && (
              <p>{formatWorkingHours(csc.working_hours)}</p>
            )}
          </div>
        </div>
      )}

      {/* Availability note */}
      {!compact && csc.availability_note && (
        <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <strong>Note:</strong> {csc.availability_note}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {csc.booking_url ? (
          <Button asChild className="gap-2">
            <a href={csc.booking_url} target="_blank" rel="noopener noreferrer">
              <Calendar className="h-4 w-4" />
              Book a Meeting
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        ) : (
          <div className="text-sm text-muted-foreground">
            Booking link not available. Contact via email.
          </div>
        )}
        
        {csc.linkedin_url && (
          <Button variant="outline" size="icon" asChild>
            <a href={csc.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn Profile">
              <Linkedin className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Your Client Success Champion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderCSCCard(primaryCSC, true)}
        
        {backupCSCs.length > 0 && (
          <>
            <hr className="border-border" />
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Backup Support</h4>
              {backupCSCs.map(csc => renderCSCCard(csc, false))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
