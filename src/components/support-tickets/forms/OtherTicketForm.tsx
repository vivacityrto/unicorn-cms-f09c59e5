import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Required'),
});

export type OtherFormValues = z.infer<typeof schema>;

export interface FormHandle {
  submit: () => Promise<OtherFormValues | null>;
}

export const OtherTicketForm = forwardRef<FormHandle>((_, ref) => {
  const form = useForm<OtherFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '' },
  });

  useImperativeHandle(ref, () => ({
    submit: () =>
      new Promise((resolve) => {
        form.handleSubmit((v) => resolve(v), () => resolve(null))();
      }),
  }));

  const { register, formState: { errors } } = form;

  return (
    <form className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Tell us more *</Label>
        <Textarea id="description" rows={5} {...register('description')} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>
    </form>
  );
});
OtherTicketForm.displayName = 'OtherTicketForm';
