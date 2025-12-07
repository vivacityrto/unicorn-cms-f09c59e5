import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { useEosChartDrafts } from '@/hooks/useEosDrafts';

interface ChartReviewPaneProps {
  meetingId: string;
}

export const ChartReviewPane = ({ meetingId }: ChartReviewPaneProps) => {
  const { draft, proposeDraft } = useEosChartDrafts(meetingId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Accountability Chart Review</h3>
        <p className="text-sm text-muted-foreground">
          Review and propose updates to the Accountability Chart. Changes will be saved as drafts for Admin approval.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          The interactive Accountability Chart editor will be available in a future update. 
          For now, use the notes section below to capture proposed changes.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Chart</CardTitle>
          <CardDescription>
            Review the current organizational structure and roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground text-center">
              Chart visualization placeholder
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proposed Changes</CardTitle>
          <CardDescription>
            Document any changes to roles, responsibilities, or structure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="w-full min-h-[200px] p-3 border rounded-md"
            placeholder="Describe proposed changes to the Accountability Chart..."
            defaultValue={draft?.draft_json.notes || ''}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline">Discard</Button>
            <Button 
              onClick={() => proposeDraft.mutate({ notes: 'Draft changes...' })}
              disabled={proposeDraft.isPending}
            >
              Save as Draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
