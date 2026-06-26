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
  trying_to_do: z.string().min(1, 'Required'),
  what_happened: z.string().min(1, 'Required'),
  error_message: z.string().optional(),
});

export type ClientBrokenFormValues = z.infer<typeof schema>;
export interface FormHandle { submit: () => Promise<ClientBrokenFormValues | null>; }

export const ClientBrokenForm = forwardRef<FormHandle>((_, ref) => {
  const form = useForm<ClientBrokenFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', urgency: 'medium', trying_to_do: '', what_happened: '', error_message: '' },
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
        <Input id="title" {...register('title')} placeholder="Brief summary" />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Urgency</Label>
        <UrgencySelect value={watch('urgency')} onChange={(v) => setValue('urgency', v as Urgency)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trying_to_do">What were you trying to do? *</Label>
        <Textarea id="trying_to_do" rows={2} {...register('trying_to_do')} />
        {errors.trying_to_do && <p className="text-xs text-destructive">{errors.trying_to_do.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="what_happened">What happened instead? *</Label>
        <Textarea id="what_happened" rows={2} {...register('what_happened')} />
        {errors.what_happened && <p className="text-xs text-destructive">{errors.what_happened.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="error_message">Did you see an error message?</Label>
        <Textarea id="error_message" rows={2} placeholder="Paste the error message here (optional)" {...register('error_message')} />
      </div>
    </form>
  );
});
ClientBrokenForm.displayName = 'ClientBrokenForm';
