import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, FileText, Calendar } from 'lucide-react';
import { useQCDetails } from '@/hooks/useQuarterlyConversations';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { QCSectionCard } from '@/components/eos/qc/QCSectionCard';
import { GWCPanel } from '@/components/eos/qc/GWCPanel';
import { QCSignoffBar } from '@/components/eos/qc/QCSignoffBar';

export default function EosQCSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { qc, template, answers, fit, signoffs, isLoading } = useQCDetails(id);

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
          <Badge variant={isSigned ? 'outline' : 'default'}>
            {isSigned ? 'Completed' : qc.status}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conversation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium">Reviewee:</span> {qc.reviewee_id}
              </div>
              <div>
                <span className="font-medium">Manager(s):</span> {qc.manager_ids.length} assigned
              </div>
              <div>
                <span className="font-medium">Scheduled:</span>{' '}
                {qc.scheduled_at ? format(new Date(qc.scheduled_at), 'PPP') : 'Not scheduled'}
              </div>
              <div>
                <span className="font-medium">Template:</span> {template.name}
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
                <GWCPanel qcId={qc.id} section={section} fit={fit} disabled={isSigned} />
              ) : (
                <QCSectionCard 
                  qcId={qc.id}
                  section={section}
                  answers={answers?.filter(a => a.section_key === section.key) || []}
                  disabled={isSigned}
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
