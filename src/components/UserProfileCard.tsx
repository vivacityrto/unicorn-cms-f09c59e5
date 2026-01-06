import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Edit, Trash2, Mail, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TEAM_LABELS: Record<string, { label: string; color: string }> = {
  csc: { label: 'CSC', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  csc_admin: { label: 'CSC Admin', color: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  growth: { label: 'Growth', color: 'bg-purple-500/10 text-purple-700 border-purple-200' },
  leadership: { label: 'Leadership', color: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  other: { label: 'Staff', color: 'bg-gray-500/10 text-gray-700 border-gray-200' },
};

interface UserProfileCardProps {
  user: {
    user_uuid: string;
    first_name: string;
    last_name: string;
    email: string;
    mobile_phone: string | null;
    user_type: string;
    unicorn_role: string;
    tenant_name?: string | null;
    disabled: boolean;
    archived: boolean;
    avatar_url?: string | null;
    staff_team?: string | null;
  };
  onEdit: (user: any) => void;
  onDelete: (userId: string, userName: string) => void;
  animationDelay?: number;
}

export function UserProfileCard({ user, onEdit, onDelete, animationDelay = 0 }: UserProfileCardProps) {
  const navigate = useNavigate();
  const fullName = `${user.first_name} ${user.last_name}`.trim() || 'Unnamed User';
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
  const isActive = !user.disabled && !user.archived;

  return (
    <Card 
      className="group hover:shadow-lg transition-all duration-300 cursor-pointer animate-fade-in overflow-hidden"
      style={{ animationDelay: `${animationDelay}ms` }}
      onClick={() => navigate(`/user-profile/${user.user_uuid}`)}
    >
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center">
          {/* Avatar */}
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full border-4 border-primary/20 p-1">
              <Avatar className="w-full h-full">
                <AvatarImage src={user.avatar_url || undefined} alt={fullName} />
                <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
            {/* Status indicator */}
            <div 
              className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-background ${
                isActive ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
          </div>

          {/* User Type & Team Badges */}
          <div className="flex flex-wrap justify-center gap-1 mb-2">
            <Badge variant="outline" className="text-xs">
              {user.user_type}
            </Badge>
            {user.staff_team && TEAM_LABELS[user.staff_team] && (
              <Badge variant="outline" className={`text-xs ${TEAM_LABELS[user.staff_team].color}`}>
                {TEAM_LABELS[user.staff_team].label}
              </Badge>
            )}
          </div>

          {/* Name */}
          <h3 className="font-semibold text-lg text-foreground mb-1">{fullName}</h3>
          
          {/* Role */}
          <p className="text-sm text-muted-foreground mb-3">{user.unicorn_role}</p>

          {/* Contact Info */}
          <div className="w-full space-y-2 mb-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate max-w-[180px]">{user.email}</span>
            </div>
            {user.mobile_phone && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{user.mobile_phone}</span>
              </div>
            )}
          </div>

          {/* Tenant */}
          {user.tenant_name && (
            <p className="text-xs text-muted-foreground mb-4 truncate max-w-full">
              {user.tenant_name}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(user)}
              className="h-9 px-4 hover:bg-primary/10 hover:text-primary hover:border-primary"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(user.user_uuid, fullName)}
              className="h-9 px-4 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
