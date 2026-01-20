import { format } from 'date-fns';
import { Clock, Users, CheckCircle, ListTodo, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { EosMeetingMinutesVersion } from '@/types/eos';

interface MinutesVersionViewerProps {
  version: EosMeetingMinutesVersion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MinutesVersionViewer({ version, open, onOpenChange }: MinutesVersionViewerProps) {
  if (!version) return null;

  const snapshot = version.minutes_snapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Minutes Version {version.version_number}
            {version.is_final && (
              <Badge>Final</Badge>
            )}
            {version.is_locked && (
              <Badge variant="destructive">Locked</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {version.change_summary || 'No change summary provided'}
            <span className="block text-xs mt-1">
              Created {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Attendance */}
            {snapshot.attendance && snapshot.attendance.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" />
                  Attendance ({snapshot.attendance.filter(a => a.attended).length}/{snapshot.attendance.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {snapshot.attendance.map((attendee, idx) => (
                    <Badge 
                      key={idx} 
                      variant={attendee.attended ? 'default' : 'outline'}
                      className={!attendee.attended ? 'opacity-50' : ''}
                    >
                      {attendee.name}
                      {!attendee.attended && ' (Absent)'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Segments/Notes */}
            {snapshot.segments && snapshot.segments.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4" />
                  Agenda Segments
                </h4>
                <div className="space-y-3">
                  {snapshot.segments.map((segment, idx) => (
                    <div key={idx} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{segment.name}</span>
                        <span className="text-xs text-muted-foreground">{segment.duration_minutes} min</span>
                      </div>
                      {segment.notes && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{segment.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Decisions */}
            {snapshot.decisions && snapshot.decisions.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4" />
                  Key Decisions
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {snapshot.decisions.map((decision, idx) => (
                    <li key={idx} className="text-sm">{decision.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {snapshot.action_items && snapshot.action_items.length > 0 && (
              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <ListTodo className="h-4 w-4" />
                  Action Items
                </h4>
                <div className="space-y-2">
                  {snapshot.action_items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between border rounded p-2">
                      <div>
                        <span className="text-sm">{item.title}</span>
                        {item.owner_name && (
                          <span className="text-xs text-muted-foreground ml-2">→ {item.owner_name}</span>
                        )}
                      </div>
                      {item.due_date && (
                        <span className="text-xs text-muted-foreground">
                          Due: {format(new Date(item.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Items */}
            {snapshot.linked_items && (
              <>
                {snapshot.linked_items.rocks && snapshot.linked_items.rocks.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Rocks Discussed</h4>
                    <div className="space-y-1">
                      {snapshot.linked_items.rocks.map((rock, idx) => (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{rock.status}</Badge>
                          {rock.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {snapshot.linked_items.issues && snapshot.linked_items.issues.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Issues Discussed</h4>
                    <div className="space-y-1">
                      {snapshot.linked_items.issues.map((issue, idx) => (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{issue.status}</Badge>
                          {issue.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
