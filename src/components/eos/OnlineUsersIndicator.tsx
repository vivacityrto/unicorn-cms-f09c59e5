import { Users, CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { OnlineUser } from '@/hooks/useMeetingRealtime';
import type { MeetingAttendee } from '@/hooks/useMeetingAttendance';

interface OnlineUsersIndicatorProps {
  onlineUsers: OnlineUser[];
  attendees?: MeetingAttendee[];
}

export const OnlineUsersIndicator = ({ onlineUsers, attendees }: OnlineUsersIndicatorProps) => {
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const isAttendee = (userId: string) => {
    return attendees?.some(a => a.user_id === userId);
  };

  const isPresent = (userId: string) => {
    const attendee = attendees?.find(a => a.user_id === userId);
    return attendee?.attendance_status === 'attended' || attendee?.attendance_status === 'late';
  };

  // De-duplicate online users by user_id (multiple browser tabs)
  const uniqueOnlineUsers = onlineUsers.reduce((acc, user) => {
    if (user.user_id && !acc.find(u => u.user_id === user.user_id)) {
      acc.push(user);
    }
    return acc;
  }, [] as OnlineUser[]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <div className="relative">
            <Users className="h-4 w-4" />
            {uniqueOnlineUsers.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <span>{uniqueOnlineUsers.length} online</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Online Now ({uniqueOnlineUsers.length})</h4>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {uniqueOnlineUsers.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No users currently online
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {uniqueOnlineUsers.map((user, idx) => (
                <div
                  key={`${user.user_id}-${idx}`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(user.name || 'Anonymous')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Anonymous'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isPresent(user.user_id) 
                        ? 'Present' 
                        : isAttendee(user.user_id) 
                          ? 'Invited' 
                          : 'Viewing'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isAttendee(user.user_id) && (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
