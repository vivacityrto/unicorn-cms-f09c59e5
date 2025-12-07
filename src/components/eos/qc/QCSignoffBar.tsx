import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, PenLine } from 'lucide-react';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import type { QCSignoff } from '@/types/qc';

interface QCSignoffBarProps {
  qcId: string;
  signoffs: QCSignoff[];
  isReviewee: boolean;
  isManager: boolean;
  hasUserSigned: boolean;
}

export const QCSignoffBar = ({
  qcId,
  signoffs,
  isReviewee,
  isManager,
  hasUserSigned,
}: QCSignoffBarProps) => {
  const { signQC } = useQuarterlyConversations();

  const managerSigned = signoffs.some(s => s.role === 'manager');
  const revieweeSigned = signoffs.some(s => s.role === 'reviewee');
  const fullySignedOff = managerSigned && revieweeSigned;

  const handleSign = async () => {
    const role = isReviewee ? 'reviewee' : 'manager';
    await signQC.mutateAsync({ qc_id: qcId, role });
  };

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Sign-off Required</h3>
          <p className="text-sm text-muted-foreground">
            Both manager and team member must sign to complete this conversation
          </p>
        </div>
        {fullySignedOff && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          {managerSigned ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-muted" />
          )}
          <div className="flex-1">
            <p className="font-medium text-sm">Manager</p>
            <p className="text-xs text-muted-foreground">
              {managerSigned ? 'Signed' : 'Pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 border rounded-lg">
          {revieweeSigned ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-muted" />
          )}
          <div className="flex-1">
            <p className="font-medium text-sm">Team Member</p>
            <p className="text-xs text-muted-foreground">
              {revieweeSigned ? 'Signed' : 'Pending'}
            </p>
          </div>
        </div>
      </div>

      {!hasUserSigned && !fullySignedOff && (isReviewee || isManager) && (
        <Button 
          onClick={handleSign} 
          disabled={signQC.isPending}
          className="w-full"
        >
          <PenLine className="h-4 w-4 mr-2" />
          {signQC.isPending ? 'Signing...' : `Sign as ${isReviewee ? 'Team Member' : 'Manager'}`}
        </Button>
      )}

      {hasUserSigned && !fullySignedOff && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            You've signed. Waiting for {isReviewee ? 'manager' : 'team member'} signature.
          </p>
        </div>
      )}
    </div>
  );
};
