import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useEosVtoDrafts } from '@/hooks/useEosDrafts';
import type { EosVtoVersion } from '@/types/eos';

interface VTOReviewPaneProps {
  meetingId: string;
  currentVto?: EosVtoVersion | null;
}

export const VTOReviewPane = ({ meetingId, currentVto }: VTOReviewPaneProps) => {
  const { draft, proposeDraft } = useEosVtoDrafts(meetingId);
  
  const [draftChanges, setDraftChanges] = useState<Record<string, any>>({
    three_year_picture: draft?.draft_json.three_year_picture || currentVto?.ten_year_target || '',
    one_year_plan: draft?.draft_json.one_year_plan || '',
    one_year_revenue_target: draft?.draft_json.one_year_revenue_target || currentVto?.one_year_revenue_target || 0,
    one_year_profit_target: draft?.draft_json.one_year_profit_target || currentVto?.one_year_profit_target || 0,
  });

  const handleSaveDraft = () => {
    proposeDraft.mutate(draftChanges);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">V/TO Review</h3>
        <p className="text-sm text-muted-foreground">
          Review and propose updates to Vision/Traction Organizer™. Changes will be saved as drafts for Admin approval.
        </p>
      </div>

      <Tabs defaultValue="three-year" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="three-year">3-Year Picture</TabsTrigger>
          <TabsTrigger value="one-year">1-Year Plan</TabsTrigger>
        </TabsList>

        <TabsContent value="three-year" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Three-Year Picture</CardTitle>
              <CardDescription>
                Where do we see ourselves in 3 years? What does success look like?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current 3-Year Target</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentVto?.ten_year_target || 'Not set'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Proposed Updates</Label>
                <Textarea
                  placeholder="Describe the 3-year vision..."
                  value={draftChanges.three_year_picture}
                  onChange={(e) => setDraftChanges({ 
                    ...draftChanges, 
                    three_year_picture: e.target.value 
                  })}
                  rows={6}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="one-year" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">One-Year Plan</CardTitle>
              <CardDescription>
                What are our key objectives and targets for the next year?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>One-Year Goals & Priorities</Label>
                <Textarea
                  placeholder="List key goals, initiatives, and priorities for the year..."
                  value={draftChanges.one_year_plan}
                  onChange={(e) => setDraftChanges({ 
                    ...draftChanges, 
                    one_year_plan: e.target.value 
                  })}
                  rows={6}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Revenue Target</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={draftChanges.one_year_revenue_target}
                    onChange={(e) => setDraftChanges({ 
                      ...draftChanges, 
                      one_year_revenue_target: Number(e.target.value) 
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Profit Target</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={draftChanges.one_year_profit_target}
                    onChange={(e) => setDraftChanges({ 
                      ...draftChanges, 
                      one_year_profit_target: Number(e.target.value) 
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Discard Changes</Button>
        <Button 
          onClick={handleSaveDraft}
          disabled={proposeDraft.isPending}
        >
          Save as Draft
        </Button>
      </div>
    </div>
  );
};
