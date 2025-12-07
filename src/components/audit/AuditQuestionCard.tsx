import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface AuditQuestionCardProps {
  question: any;
  onSaveResponse: (data: any) => Promise<any>;
}

export const AuditQuestionCard = ({ question, onSaveResponse }: AuditQuestionCardProps) => {
  const [rating, setRating] = useState(question.response?.rating || '');
  const [notes, setNotes] = useState(question.response?.notes || '');
  const [riskLevel, setRiskLevel] = useState(question.response?.risk_level || 'none');

  const handleSave = async () => {
    await onSaveResponse({
      questionId: question.question_id,
      rating,
      notes,
      riskLevel,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{question.question_text}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Rating</label>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger>
              <SelectValue placeholder="Select rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compliant">Compliant</SelectItem>
              <SelectItem value="partially_compliant">Partially Compliant</SelectItem>
              <SelectItem value="non_compliant">Non-Compliant</SelectItem>
              <SelectItem value="not_applicable">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Risk Level</label>
          <Select value={riskLevel} onValueChange={setRiskLevel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add observations and evidence..."
            rows={4}
          />
        </div>

        <Button onClick={handleSave} disabled={!rating}>
          Save Response
        </Button>
      </CardContent>
    </Card>
  );
};
