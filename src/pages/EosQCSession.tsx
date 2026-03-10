import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, CheckCircle, FileText, Calendar, Play, Lock, Clock, Bell } from 'lucide-react';
import { useQCDetails, useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { useQCUserProfiles } from '@/hooks/useQCUserProfiles';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { QCSectionCard } from '@/components/eos/qc/QCSectionCard';
import { GWCPanel } from '@/components/eos/qc/GWCPanel';
import { QCSignoffBar } from '@/components/eos/qc/QCSignoffBar';

export default function EosQCSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { qc, template, answers, fit, signoffs, isLoading } = useQCDetails(id);
  const { startMeeting } = useQuarterlyConversations();
  const [sendingReminder, setSendingReminder] = useState(false);

  const sendReminder = async () => {
    if (!qc || !profile) return;
    setSendingReminder(true);
    const senderName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Your manager';
    const formattedDate = qc.scheduled_at ? format(new Date(qc.scheduled_at), 'PPP') : 'TBD';
    const qcLink = `/eos/qc/${qc.id}`;

    // Determine who to remind: all participants who haven't completed their assessment
    const recipientIds = [qc.reviewee_id, ...qc.manager_ids].filter(uid => uid !== profile.user_uuid);

    try {
      // In-app notifications
      const notifications = recipientIds.map(uid => ({
        user_id: uid,
        type: 'qc_reminder',
        title: 'QC Reminder: Complete Your Assessment',
        message: `${senderName} is reminding you to complete your Quarterly Conversation assessment scheduled for ${formattedDate}.`,
        link: qcLink,
        created_by: profile.user_uuid,
      }));
      await supabase.from('user_notifications').insert(notifications as any);

      // Email notifications
      const { data: userData } = await supabase
        .from('users')
        .select('user_uuid, email, first_name')
        .in('user_uuid', recipientIds);

      if (userData?.length) {
        await Promise.allSettled(
          userData.map(u =>
            supabase.functions.invoke('send-composed-email', {
              body: {
                tenant_id: 111,
                to: u.email,
                subject: `Reminder: Complete Your Quarterly Conversation — ${formattedDate}`,
                body_html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">QC Reminder</h2>
                    <p>Hi ${u.first_name || 'there'},</p>
                    <p><strong>${senderName}</strong> is reminding you to complete your Quarterly Conversation assessment.</p>
                    <table style="margin: 16px 0; border-collapse: collapse;">
                      <tr><td style="padding: 4px 12px 4px 0; color: #666; font-weight: 600;">Scheduled</td><td>${formattedDate}</td></tr>
                    </table>
                    <p style="margin-top: 24px;">
                      <a href="https://unicorn-cms.lovable.app${qcLink}" style="background-color: #7c3aed; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                        Complete Your Assessment
                      </a>
                    </p>
                  </div>
                `,
              },
            })
          )
        );
      }

      toast({ title: 'Reminder sent', description: `Notified ${recipientIds.length} team member(s) to complete their assessment.` });
    } catch (e) {
      console.error('Failed to send QC reminder:', e);
      toast({ title: 'Failed to send reminder', variant: 'destructive' });
    } finally {
      setSendingReminder(false);
    }
  };

  // Collect user IDs for profile resolution
  const allUserIds = useMemo(() => {
    if (!qc) return [];
    return [qc.reviewee_id, ...qc.manager_ids];
  }, [qc]);

  const { getUser } = useQCUserProfiles(allUserIds);

  // Fetch core values from VTO for this tenant
  const { data: coreValues } = useQuery({
    queryKey: ['vto-core-values', qc?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_vto')
        .select('core_values')
        .eq('tenant_id', qc!.tenant_id!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.core_values) ? (data.core_values as string[]) : [];
    },
    enabled: !!qc?.tenant_id,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !qc || !template) {
    return (
      <DashboardLayout>
        <div className="p-8">Loading conversation...</div>
      </DashboardLayout>
    );
  }

  const isReviewee = qc.reviewee_id === profile?.user_uuid;
  const isManager = qc.manager_ids.includes(profile?.user_uuid || '');
  const isSigned = signoffs && signoffs.length >= 2;
  const hasUserSigned = signoffs?.some(s => s.signed_by === profile?.user_uuid);
  const isMeetingMode = !!qc.meeting_started_at;
  const respondentRole: 'manager' | 'reviewee' = isReviewee ? 'reviewee' : 'manager';

  // Filter answers based on role and mode
  // Manager: always sees both sets of answers
  // Reviewee: sees only their own until meeting mode
  const myAnswers = answers?.filter(a => a.respondent_role === respondentRole) || [];
  const otherAnswers = answers?.filter(a => a.respondent_role !== respondentRole) || [];
  const canSeeOther = isManager || isMeetingMode;

  // Filter fit records
  const myFit = fit?.find(f => f.respondent_role === respondentRole) || null;
  const otherFit = fit?.find(f => f.respondent_role !== respondentRole) || null;

  const reviewee = getUser(qc.reviewee_id);
  const managers = qc.manager_ids.map(id => ({ id, ...getUser(id) }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/eos/qc')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Quarterly Conversation</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(qc.quarter_start), 'MMM yyyy')} - {format(new Date(qc.quarter_end), 'MMM yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isMeetingMode ? (
              <Badge variant="default" className="bg-green-600">
                <Play className="h-3 w-3 mr-1" />
                Meeting Mode
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                Preparation Phase
              </Badge>
            )}
            <Badge variant={isSigned ? 'outline' : 'default'}>
              {isSigned ? 'Completed' : qc.status}
            </Badge>
          </div>
        </div>

        {/* Phase indicator */}
        {!isMeetingMode && !isSigned && (
          <div className="bg-accent/50 border border-border rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Preparation Phase</p>
                <p className="text-sm text-muted-foreground">
                  {isManager
                    ? "Complete your assessment. You can view the reviewee's responses alongside your own."
                    : "Complete your self-assessment independently. Your manager's responses are hidden until the meeting begins."}
                </p>
              </div>
            </div>
            {isManager && (
              <Button
                onClick={() => startMeeting.mutate(qc.id)}
                disabled={startMeeting.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                {startMeeting.isPending ? 'Starting...' : 'Start Meeting'}
              </Button>
            )}
          </div>
        )}

        {isMeetingMode && !isSigned && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
            <Play className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Meeting In Progress</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Both responses are now visible side-by-side. Discuss differences and align on outcomes.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conversation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-6">
              {/* Reviewee */}
              <div className="space-y-1.5">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Reviewee</span>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={reviewee.avatarUrl || undefined} alt={reviewee.fullName} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {reviewee.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{reviewee.fullName}</span>
                </div>
              </div>

              {/* Manager(s) */}
              <div className="space-y-1.5">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">
                  Manager{managers.length > 1 ? 's' : ''}
                </span>
                <div className="flex flex-col gap-2">
                  {managers.map((mgr) => (
                    <div key={mgr.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={mgr.avatarUrl || undefined} alt={mgr.fullName} />
                        <AvatarFallback className="bg-accent text-accent-foreground text-sm font-medium">
                          {mgr.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{mgr.fullName}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scheduled */}
              <div className="space-y-1.5">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Scheduled</span>
                <span className="block font-medium">
                  {qc.scheduled_at ? format(new Date(qc.scheduled_at), 'PPP') : 'Not scheduled'}
                </span>
              </div>

              {/* Template */}
              <div className="space-y-1.5">
                <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">Template</span>
                <span className="block font-medium">{template.name}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {isSigned && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">This conversation is completed and locked</p>
              <p className="text-sm text-muted-foreground">
                Both parties have signed off. Content cannot be edited.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue={template.sections[0]?.key || 'overview'} className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            {template.sections.map((section) => (
              <TabsTrigger key={section.key} value={section.key}>
                {section.title}
              </TabsTrigger>
            ))}
            <TabsTrigger value="summary">Summary & Sign-off</TabsTrigger>
          </TabsList>

          {template.sections.map((section) => (
            <TabsContent key={section.key} value={section.key}>
              {section.key === 'gwc' ? (
                <GWCPanel
                  qcId={qc.id}
                  section={section}
                  myFit={myFit}
                  otherFit={canSeeOther ? otherFit : null}
                  respondentRole={respondentRole}
                  isMeetingMode={canSeeOther}
                  disabled={!!isSigned}
                />
              ) : (
                <QCSectionCard 
                  qcId={qc.id}
                  section={section}
                  myAnswers={myAnswers.filter(a => a.section_key === section.key)}
                  otherAnswers={canSeeOther ? otherAnswers.filter(a => a.section_key === section.key) : []}
                  respondentRole={respondentRole}
                  isMeetingMode={canSeeOther}
                  disabled={!!isSigned}
                  coreValues={section.key === 'core_values' ? coreValues : undefined}
                />
              )}
            </TabsContent>
          ))}

          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Summary & Sign-off</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="prose prose-sm">
                  <h3>Conversation Summary</h3>
                  <p className="text-muted-foreground">
                    Review all sections before signing off on this conversation.
                  </p>
                </div>

                <QCSignoffBar 
                  qcId={qc.id}
                  signoffs={(signoffs || []) as any}
                  isReviewee={isReviewee}
                  isManager={isManager}
                  hasUserSigned={hasUserSigned}
                />

                {isSigned && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      <FileText className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                    <Button variant="outline" className="flex-1">
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule Next QC
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
