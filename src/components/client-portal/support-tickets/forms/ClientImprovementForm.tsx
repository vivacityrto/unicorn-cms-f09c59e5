import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UrgencySelect, Urgency } from '@/components/support-tickets/shared/UrgencySelect';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  improvement_context: z.string().optional(),
  description: z.string().min(1, 'Required'),
});

export type ClientImprovementFormValues = z.infer<typeof schema>;
export interface FormHandle { submit: () => Promise<ClientImprovementFormValues | null>; }

export const ClientImprovementForm = forwardRef<FormHandle>((_, ref) => {
  const form = useForm<ClientImprovementFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', urgency: 'medium', improvement_context: '', description: '' },
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
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Urgency</Label>
        <UrgencySelect value={watch('urgency')} onChange={(v) => setValue('urgency', v as Urgency)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="improvement_context">What's the current experience?</Label>
        <Textarea id="improvement_context" rows={3} {...register('improvement_context')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">What would you improve? *</Label>
        <Textarea id="description" rows={4} {...register('description')} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>
    </form>
  );
});
ClientImprovementForm.displayName = 'ClientImprovementForm';
