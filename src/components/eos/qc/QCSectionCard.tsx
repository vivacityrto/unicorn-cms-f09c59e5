import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import type { QCSection, QCAnswer, QCPrompt } from '@/types/qc';

interface QCSectionCardProps {
  qcId: string;
  section: QCSection;
  answers: QCAnswer[];
  disabled?: boolean;
}

export const QCSectionCard = ({ qcId, section, answers, disabled }: QCSectionCardProps) => {
  const { upsertAnswer } = useQuarterlyConversations();
  const [localAnswers, setLocalAnswers] = useState<Record<string, any>>({});

  // Initialize local answers from saved data
  useEffect(() => {
    const answerMap: Record<string, any> = {};
    answers.forEach(answer => {
      answerMap[answer.prompt_key] = answer.value_json;
    });
    setLocalAnswers(answerMap);
  }, [answers]);

  const handleAnswerChange = (promptKey: string, value: any) => {
    const newAnswers = { ...localAnswers, [promptKey]: value };
    setLocalAnswers(newAnswers);

    // Auto-save after 1 second delay
    setTimeout(() => {
      upsertAnswer.mutate({
        qc_id: qcId,
        section_key: section.key,
        prompt_key: promptKey,
        value_json: { value },
      });
    }, 1000);
  };

  const renderPrompt = (prompt: QCPrompt) => {
    const value = localAnswers[prompt.key]?.value || '';

    switch (prompt.type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => handleAnswerChange(prompt.key, e.target.value)}
            disabled={disabled}
            placeholder={prompt.label}
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleAnswerChange(prompt.key, e.target.value)}
            disabled={disabled}
            placeholder={prompt.label}
            rows={4}
          />
        );

      case 'boolean':
        return (
          <RadioGroup
            value={value?.toString() || ''}
            onValueChange={(val) => handleAnswerChange(prompt.key, val === 'true')}
            disabled={disabled}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`${prompt.key}-yes`} />
              <Label htmlFor={`${prompt.key}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`${prompt.key}-no`} />
              <Label htmlFor={`${prompt.key}-no`}>No</Label>
            </div>
          </RadioGroup>
        );

      case 'rating':
        return (
          <RadioGroup
            value={value}
            onValueChange={(val) => handleAnswerChange(prompt.key, val)}
            disabled={disabled}
            className="flex gap-4"
          >
            {prompt.scale?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${prompt.key}-${option}`} />
                <Label htmlFor={`${prompt.key}-${option}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'list':
      case 'checklist':
        return (
          <Textarea
            value={value}
            onChange={(e) => handleAnswerChange(prompt.key, e.target.value)}
            disabled={disabled}
            placeholder="Enter items, one per line"
            rows={6}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>
          Complete the questions below for this section
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {section.prompts.map((prompt) => (
          <div key={prompt.key} className="space-y-2">
            <Label>
              {prompt.label}
              {prompt.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {renderPrompt(prompt)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
