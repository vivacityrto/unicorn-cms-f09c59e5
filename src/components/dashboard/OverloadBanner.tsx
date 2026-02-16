import { AlertTriangle } from 'lucide-react';

interface Props {
  show: boolean;
}

export function OverloadBanner({ show }: Props) {
  if (!show) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2.5 flex items-center gap-2 text-sm font-medium">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Capacity exceeded. Review assignments before continuing triage.</span>
    </div>
  );
}
