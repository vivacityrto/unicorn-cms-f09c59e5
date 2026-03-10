import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { Heart } from 'lucide-react';
import type { QCSection, QCAnswer, QCPrompt } from '@/types/qc';

interface QCSectionCardProps {
  qcId: string;
  section: QCSection;
  myAnswers: QCAnswer[];
  otherAnswers: QCAnswer[];
  respondentRole: 'manager' | 'reviewee';
  isMeetingMode: boolean;
  disabled?: boolean;
  coreValues?: string[];
}

export const QCSectionCard = ({ qcId, section, myAnswers, otherAnswers, respondentRole, isMeetingMode, disabled, coreValues }: QCSectionCardProps) => {
  const { upsertAnswer } = useQuarterlyConversations();
  const [localAnswers, setLocalAnswers] = useState<Record<string, any>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    const answerMap: Record<string, any> = {};
    myAnswers.forEach(answer => {
      answerMap[answer.prompt_key] = answer.value_json;
    });
    setLocalAnswers(answerMap);
  }, [myAnswers]);

  const handleAnswerChange = (promptKey: string, value: any) => {
    const newAnswers = { ...localAnswers, [promptKey]: { value } };
    setLocalAnswers(newAnswers);

    if (debounceTimers.current[promptKey]) {
      clearTimeout(debounceTimers.current[promptKey]);
    }
    debounceTimers.current[promptKey] = setTimeout(() => {
      upsertAnswer.mutate({
        qc_id: qcId,
        section_key: section.key,
        prompt_key: promptKey,
        value_json: { value },
        respondent_role: respondentRole,
      });
    }, 1000);
  };

  const getOtherValue = (promptKey: string) => {
    const otherAnswer = otherAnswers.find(a => a.prompt_key === promptKey);
    return otherAnswer?.value_json?.value || '';
  };

  const renderPromptInput = (prompt: QCPrompt, value: any, isDisabled: boolean, idPrefix: string = '') => {
    switch (prompt.type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => !isDisabled && handleAnswerChange(prompt.key, e.target.value)}
            disabled={isDisabled}
            placeholder={prompt.label}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => !isDisabled && handleAnswerChange(prompt.key, e.target.value)}
            disabled={isDisabled}
            placeholder={prompt.label}
            rows={4}
          />
        );
      case 'boolean':
        return (
          <RadioGroup
            value={value?.toString() || ''}
            onValueChange={(val) => !isDisabled && handleAnswerChange(prompt.key, val === 'true')}
            disabled={isDisabled}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`${idPrefix}${prompt.key}-yes`} />
              <Label htmlFor={`${idPrefix}${prompt.key}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`${idPrefix}${prompt.key}-no`} />
              <Label htmlFor={`${idPrefix}${prompt.key}-no`}>No</Label>
            </div>
          </RadioGroup>
        );
      case 'rating':
        return (
          <RadioGroup
            value={value}
            onValueChange={(val) => !isDisabled && handleAnswerChange(prompt.key, val)}
            disabled={isDisabled}
            className="flex gap-4"
          >
            {prompt.scale?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${idPrefix}${prompt.key}-${option}`} />
                <Label htmlFor={`${idPrefix}${prompt.key}-${option}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case 'list':
      case 'checklist':
        return (
          <Textarea
            value={value}
            onChange={(e) => !isDisabled && handleAnswerChange(prompt.key, e.target.value)}
            disabled={isDisabled}
            placeholder="Enter items, one per line"
            rows={6}
          />
        );
      default:
        return null;
    }
  };

  const otherLabel = respondentRole === 'manager' ? "Reviewee's Response" : "Manager's Response";
  const myLabel = respondentRole === 'manager' ? "Manager's Response (You)" : "Reviewee's Response (You)";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>
          {isMeetingMode
            ? 'Compare responses side-by-side and discuss differences'
            : 'Complete the questions below for this section'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Show core values from VTO if available */}
        {coreValues && coreValues.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Core Values</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The behaviours and standards that guide every decision and action.
            </p>
            <ul className="space-y-1">
              {coreValues.map((value, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {value}
                </li>
              ))}
            </ul>
          </div>
        )}
        {section.prompts.map((prompt) => {
          const myValue = localAnswers[prompt.key]?.value || '';

          if (isMeetingMode) {
            const otherValue = getOtherValue(prompt.key);
            return (
              <div key={prompt.key} className="space-y-3">
                <Label className="text-base">
                  {prompt.label}
                  {prompt.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {respondentRole === 'reviewee' ? myLabel : otherLabel}
                    </span>
                    <div className="p-3 border rounded-lg bg-muted/30 min-h-[60px]">
                      {respondentRole === 'reviewee' ? (
                        renderPromptInput(prompt, myValue, disabled || false, 'my-')
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{otherValue || <span className="text-muted-foreground italic">No response</span>}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {respondentRole === 'manager' ? myLabel : otherLabel}
                    </span>
                    <div className="p-3 border rounded-lg bg-muted/30 min-h-[60px]">
                      {respondentRole === 'manager' ? (
                        renderPromptInput(prompt, myValue, disabled || false, 'my-')
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{otherValue || <span className="text-muted-foreground italic">No response</span>}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={prompt.key} className="space-y-2">
              <Label>
                {prompt.label}
                {prompt.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {renderPromptInput(prompt, myValue, disabled || false)}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
