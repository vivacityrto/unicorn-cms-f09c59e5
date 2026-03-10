import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { Heart, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
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

const ALIGNMENT_OPTIONS = [
  { value: 'rarely', label: 'Rarely', icon: XCircle, className: 'border-destructive/50 bg-destructive/10 text-destructive' },
  { value: 'sometimes', label: 'Sometimes', icon: MinusCircle, className: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  { value: 'consistently', label: 'Consistently', icon: CheckCircle2, className: 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400' },
] as const;

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

  const hasCoreValues = coreValues && coreValues.length > 0;

  // Filter out the generic value_alignment prompt when we have per-value assessments
  const filteredPrompts = hasCoreValues
    ? section.prompts.filter(p => p.key !== 'value_alignment')
    : section.prompts;

  const renderAlignmentBadge = (value: string | undefined) => {
    if (!value) return <span className="text-xs text-muted-foreground italic">Not rated</span>;
    const option = ALIGNMENT_OPTIONS.find(o => o.value === value.toLowerCase());
    if (!option) return <span className="text-xs">{value}</span>;
    const Icon = option.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${option.className}`}>
        <Icon className="h-3 w-3" />
        {option.label}
      </span>
    );
  };

  const renderCoreValueAssessments = () => {
    if (!hasCoreValues) return null;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Core Values</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The behaviours and standards that guide every decision and action. Rate alignment for each value below.
          </p>
        </div>

        {coreValues!.map((valueName, idx) => {
          const promptKey = `cv_alignment_${idx}`;
          const myValue = localAnswers[promptKey]?.value || '';
          const otherValue = getOtherValue(promptKey);

          if (isMeetingMode) {
            const myNotes = localAnswers[`cv_notes_${idx}`]?.value || '';
            const otherNotes = getOtherValue(`cv_notes_${idx}`);
            return (
              <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span className="font-medium text-sm">{valueName}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {respondentRole === 'reviewee' ? myLabel : otherLabel}
                    </span>
                    {respondentRole === 'reviewee' ? (
                      <div className="flex gap-2 flex-wrap">
                        {ALIGNMENT_OPTIONS.map((option) => {
                          const isSelected = myValue.toLowerCase() === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleAnswerChange(promptKey, option.value)}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all
                                ${isSelected ? option.className + ' ring-2 ring-offset-1 ring-offset-background' : 'border-border bg-background text-muted-foreground hover:bg-muted'}
                                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div>{renderAlignmentBadge(otherValue)}</div>
                    )}
                    <div className="mt-1">
                      <Label className="text-xs text-muted-foreground">Notes & Examples</Label>
                      {respondentRole === 'reviewee' ? (
                        <Textarea
                          value={myNotes}
                          onChange={(e) => !disabled && handleAnswerChange(`cv_notes_${idx}`, e.target.value)}
                          disabled={disabled}
                          placeholder={`Examples for "${valueName}"...`}
                          rows={2}
                          className="text-sm mt-1"
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap mt-1 p-2 border rounded bg-muted/30 min-h-[40px]">
                          {otherNotes || <span className="text-muted-foreground italic">No response</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {respondentRole === 'manager' ? myLabel : otherLabel}
                    </span>
                    {respondentRole === 'manager' ? (
                      <div className="flex gap-2 flex-wrap">
                        {ALIGNMENT_OPTIONS.map((option) => {
                          const isSelected = myValue.toLowerCase() === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleAnswerChange(promptKey, option.value)}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all
                                ${isSelected ? option.className + ' ring-2 ring-offset-1 ring-offset-background' : 'border-border bg-background text-muted-foreground hover:bg-muted'}
                                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div>{renderAlignmentBadge(otherValue)}</div>
                    )}
                    <div className="mt-1">
                      <Label className="text-xs text-muted-foreground">Notes & Examples</Label>
                      {respondentRole === 'manager' ? (
                        <Textarea
                          value={myNotes}
                          onChange={(e) => !disabled && handleAnswerChange(`cv_notes_${idx}`, e.target.value)}
                          disabled={disabled}
                          placeholder={`Examples for "${valueName}"...`}
                          rows={2}
                          className="text-sm mt-1"
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap mt-1 p-2 border rounded bg-muted/30 min-h-[40px]">
                          {otherNotes || <span className="text-muted-foreground italic">No response</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Pre-meeting: single rating per value + notes
          const myNotes = localAnswers[`cv_notes_${idx}`]?.value || '';
          return (
            <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span className="font-medium text-sm">{valueName}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ALIGNMENT_OPTIONS.map((option) => {
                  const isSelected = myValue.toLowerCase() === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleAnswerChange(promptKey, option.value)}
                      className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border transition-all
                        ${isSelected ? option.className + ' ring-2 ring-offset-1 ring-offset-background' : 'border-border bg-background text-muted-foreground hover:bg-muted'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes & Examples</Label>
                <Textarea
                  value={myNotes}
                  onChange={(e) => !disabled && handleAnswerChange(`cv_notes_${idx}`, e.target.value)}
                  disabled={disabled}
                  placeholder={`Provide examples for "${valueName}"...`}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>
          {hasCoreValues
            ? (respondentRole === 'manager'
              ? 'Assess whether the reviewee consistently demonstrates each core value'
              : 'Self-assess your alignment with each core value')
            : (isMeetingMode
              ? 'Compare responses side-by-side and discuss differences'
              : 'Complete the questions below for this section')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {renderCoreValueAssessments()}

        {filteredPrompts.map((prompt) => {
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
