import { TeamProfileFields } from '@/components/profile/TeamProfileFields';

interface TeamProfileTabProps {
  teamUserData: any;
  onSave: () => void;
}

export function TeamProfileTab({ teamUserData, onSave }: TeamProfileTabProps) {
  if (!teamUserData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Team profile settings are only available for Vivacity team members.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeamProfileFields 
        user={teamUserData} 
        canEdit={true} 
        onSave={onSave}
      />
    </div>
  );
}
