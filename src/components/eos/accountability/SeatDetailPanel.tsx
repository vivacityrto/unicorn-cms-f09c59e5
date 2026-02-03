import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  User, 
  Target, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingUp,
  Users,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { SeatWithDetails, UserBasic, EosSeatRoleType } from '@/types/accountabilityChart';
import { EOS_SEAT_ROLE_LABELS, EOS_ROLE_COLORS } from '@/types/accountabilityChart';

interface SeatDetailPanelProps {
  seat: SeatWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  onUpdate?: (seatId: string, updates: Partial<SeatWithDetails>) => void;
}

export function SeatDetailPanel({ 
  seat, 
  open, 
  onOpenChange, 
  canEdit,
  onUpdate 
}: SeatDetailPanelProps) {
  const [isEditingGwc, setIsEditingGwc] = useState(false);
  const [gwcDraft, setGwcDraft] = useState({
    get_it: seat?.gwc_get_it || '',
    want_it: seat?.gwc_want_it || '',
    capacity: seat?.gwc_capacity || '',
  });
  const [selectedRoleType, setSelectedRoleType] = useState<EosSeatRoleType | 'none'>(seat?.eos_role_type || 'none');

  useEffect(() => {
    if (seat) {
      setGwcDraft({
        get_it: seat.gwc_get_it || '',
        want_it: seat.gwc_want_it || '',
        capacity: seat.gwc_capacity || '',
      });
      setSelectedRoleType(seat.eos_role_type || 'none');
    }
  }, [seat]);

  if (!seat) return null;

  const primaryOwner = seat.primaryOwner;
  const secondaryOwners = seat.assignments.filter(a => a.assignment_type === 'Secondary');
  const linkedData = seat.linkedData;

  const getInitials = (user?: UserBasic) => {
    if (!user) return '?';
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || '?';
  };

  const getUserName = (user?: UserBasic) => {
    if (!user) return 'Unknown';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
  };

  const handleSaveGwc = () => {
    if (onUpdate) {
      onUpdate(seat.id, {
        gwc_get_it: gwcDraft.get_it,
        gwc_want_it: gwcDraft.want_it,
        gwc_capacity: gwcDraft.capacity,
      });
    }
    setIsEditingGwc(false);
  };

  const handleRoleTypeChange = (value: string) => {
    const newValue = value === 'none' ? null : value as EosSeatRoleType;
    setSelectedRoleType(value as EosSeatRoleType | 'none');
    if (onUpdate) {
      onUpdate(seat.id, { eos_role_type: newValue });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <SheetTitle className="text-xl">{seat.seat_name}</SheetTitle>
            {seat.eos_role_type && (
              <Badge className={cn(
                EOS_ROLE_COLORS[seat.eos_role_type].bg,
                EOS_ROLE_COLORS[seat.eos_role_type].text,
                'text-xs'
              )}>
                {EOS_SEAT_ROLE_LABELS[seat.eos_role_type]}
              </Badge>
            )}
          </div>
          <SheetDescription>{seat.description || 'No description provided'}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* EOS Role Type Selector */}
            {canEdit && (
              <div className="space-y-2">
                <Label>EOS Role Type</Label>
                <Select value={selectedRoleType} onValueChange={handleRoleTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(Object.keys(EOS_SEAT_ROLE_LABELS) as EosSeatRoleType[]).map(role => (
                      <SelectItem key={role} value={role}>
                        {EOS_SEAT_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Owner Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Seat Owner
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryOwner ? (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={primaryOwner.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(primaryOwner)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{getUserName(primaryOwner)}</p>
                      <p className="text-sm text-muted-foreground">{primaryOwner.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Vacant - No primary owner assigned</span>
                  </div>
                )}

                {secondaryOwners.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs text-muted-foreground mb-2">Backup owners</p>
                    <div className="flex flex-wrap gap-2">
                      {secondaryOwners.map(a => (
                        <div key={a.id} className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-1">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(a.user)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{getUserName(a.user)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Accountabilities */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Accountabilities ({seat.roles.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {seat.roles.length > 0 ? (
                  <ul className="space-y-2">
                    {seat.roles.map((role, i) => (
                      <li key={role.id} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span>{role.role_text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No accountabilities defined</p>
                )}
              </CardContent>
            </Card>

            {/* Linked EOS Data */}
            {linkedData && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Linked EOS Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{linkedData.active_rocks_count}</p>
                      <p className="text-xs text-muted-foreground">Active Rocks</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold">{linkedData.meetings_attended_count}</p>
                      <p className="text-xs text-muted-foreground">Meetings Attended</p>
                    </div>
                  </div>
                  {linkedData.meetings_missed_count > 0 && (
                    <div className="flex items-center gap-2 text-warning text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{linkedData.meetings_missed_count} meetings missed</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* GWC Criteria */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    GWC Criteria
                  </CardTitle>
                  {canEdit && !isEditingGwc && (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingGwc(true)}>
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingGwc ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Get It - What must they understand?</Label>
                      <Textarea
                        value={gwcDraft.get_it}
                        onChange={(e) => setGwcDraft(d => ({ ...d, get_it: e.target.value }))}
                        placeholder="Describe what it means to 'get' this seat..."
                        className="text-sm"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Want It - What motivation is required?</Label>
                      <Textarea
                        value={gwcDraft.want_it}
                        onChange={(e) => setGwcDraft(d => ({ ...d, want_it: e.target.value }))}
                        placeholder="Describe the desire needed for this seat..."
                        className="text-sm"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Capacity - What skills/time is needed?</Label>
                      <Textarea
                        value={gwcDraft.capacity}
                        onChange={(e) => setGwcDraft(d => ({ ...d, capacity: e.target.value }))}
                        placeholder="Describe the capacity requirements..."
                        className="text-sm"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveGwc}>
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditingGwc(false)}>
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <GwcItem
                      label="Get It"
                      value={seat.gwc_get_it}
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    />
                    <GwcItem
                      label="Want It"
                      value={seat.gwc_want_it}
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    />
                    <GwcItem
                      label="Capacity"
                      value={seat.gwc_capacity}
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function GwcItem({ label, value, icon }: { label: string; value?: string | null; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {value ? icon : <XCircle className="h-4 w-4 text-muted-foreground" />}
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm">{value || 'Not defined'}</p>
      </div>
    </div>
  );
}
