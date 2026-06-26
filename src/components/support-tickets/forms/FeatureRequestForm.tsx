import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UrgencySelect, Urgency } from '../shared/UrgencySelect';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1, 'Required'),
  feature_context: z.string().optional(),
});

export type FeatureFormValues = z.infer<typeof schema>;

export interface FormHandle {
  submit: () => Promise<FeatureFormValues | null>;
}

export const FeatureRequestForm = forwardRef<FormHandle>((_, ref) => {
  const form = useForm<FeatureFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', urgency: 'medium', description: '', feature_context: '' },
  });

  useImperativeHandle(ref, () => ({
    submit: () =>
      new Promise((resolve) => {
        form.handleSubmit((v) => resolve(v), () => resolve(null))();
      }),
  }));

  const { register, watch, setValue, formState: { errors } } = form;

  return (
    <form className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" {...register('title')} placeholder="Short feature title" />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Urgency</Label>
        <UrgencySelect value={watch('urgency')} onChange={(v) => setValue('urgency', v as Urgency)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Describe the feature you'd like *</Label>
        <Textarea id="description" rows={4} {...register('description')} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feature_context">Any additional context or use case?</Label>
        <Textarea id="feature_context" rows={3} {...register('feature_context')} />
      </div>
    </form>
  );
});
FeatureRequestForm.displayName = 'FeatureRequestForm';
