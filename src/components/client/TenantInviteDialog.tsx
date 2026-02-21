import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { checkSeatAvailability, PLAN_NAMES, UPGRADE_PATHS } from '@/hooks/useSeatLimits';
import { logUpgradeAttempt } from '@/hooks/useBillingSignals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Shield, User as UserIcon, AlertTriangle, ArrowUpRight, Users, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { TenantType } from '@/contexts/TenantTypeContext';
import { UpgradeModal } from '@/components/billing/UpgradeModal';

interface TenantInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  onSuccess?: () => void;
}

const TENANT_ROLES = [
  { value: 'Admin', label: 'Admin', description: 'Can manage users and settings', icon: Shield },
  { value: 'User', label: 'General User', description: 'Standard access to features', icon: UserIcon },
];

export function TenantInviteDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onSuccess,
}: TenantInviteDialogProps) {
  const { session } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('User');
  const [isSending, setIsSending] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(false);
  
  // Seat limit state
  const [checkingSeats, setCheckingSeats] = useState(true);
  const [canInvite, setCanInvite] = useState(true);
  const [currentUsers, setCurrentUsers] = useState(0);
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [seatMessage, setSeatMessage] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<TenantType | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // Check seat availability when dialog opens
  useEffect(() => {
    if (open && tenantId) {
      checkSeats();
    }
  }, [open, tenantId]);

  const checkSeats = async () => {
    setCheckingSeats(true);
    try {
      // Get tenant type first
      const { data: tenant } = await supabase
        .from("tenants")
        .select("tenant_type")
        .eq("id", tenantId)
        .single();
      
      setTenantType(tenant?.tenant_type as TenantType || null);
      
      const result = await checkSeatAvailability(tenantId);
      setCanInvite(result.canInvite);
      setCurrentUsers(result.currentUsers);
      setMaxUsers(result.maxUsers);
      setSeatMessage(result.message || null);
    } catch (error) {
      console.error('Error checking seats:', error);
    } finally {
      setCheckingSeats(false);
    }
  };

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole('User');
    onOpenChange(false);
  };

  const handleSendInvite = async () => {
    if (!firstName.trim() || !email.trim()) {
      toast.error('Please fill in required fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Double-check seat availability before sending
    const seatCheck = await checkSeatAvailability(tenantId);
    if (!seatCheck.canInvite) {
      // Log the blocked invite attempt
      await logUpgradeAttempt({
        tenantId,
        fromPlan: tenantType || 'unknown',
        toPlan: UPGRADE_PATHS[tenantType || 'academy_solo'] || 'unknown',
        triggerType: 'seat_limit_reached',
        outcome: 'blocked',
        failureReason: seatCheck.message,
      });
      
      toast.error(seatCheck.message || 'Cannot invite more users - seat limit reached');
      setCanInvite(false);
      setSeatMessage(seatCheck.message || null);
      return;
    }

    setIsSending(true);

    try {
      const token = session?.access_token;
      if (!token) {
        toast.error('Authentication required');
        return;
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email.toLowerCase().trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          invite_as: 'CLIENT',
          tenant_id: tenantId,
          unicorn_role: role,
          skip_email: !sendInvitation,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success(sendInvitation ? `Invitation sent to ${email}` : `${firstName} added to ${tenantName}`);
        handleClose();
        onSuccess?.();
      } else {
        toast.error(data?.detail || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  const canSend = firstName.trim() && email.trim() && role && !isSending && canInvite && !checkingSeats;

  const nextPlan = tenantType ? UPGRADE_PATHS[tenantType] : null;
  const nextPlanName = nextPlan ? PLAN_NAMES[nextPlan] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Invite a new user to <strong>{tenantName}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Seat Limit Warning */}
        {!checkingSeats && !canInvite && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Seat Limit Reached
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                {seatMessage || `You've used all ${maxUsers} seats in your plan.`}
              </p>
              {nextPlanName && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setUpgradeModalOpen(true)}
                >
                  Upgrade to {nextPlanName}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Seat Usage Info */}
        {!checkingSeats && canInvite && maxUsers !== null && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {currentUsers} of {maxUsers} seats used
            </span>
            {maxUsers - currentUsers <= 2 && (
              <span className="ml-auto text-warning font-medium">
                {maxUsers - currentUsers} remaining
              </span>
            )}
          </div>
        )}

        {/* Loading State */}
        {checkingSeats && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Checking availability...</span>
          </div>
        )}

        {/* Form - Only show if can invite */}
        {canInvite && !checkingSeats && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <r.icon className="h-4 w-4" />
                        <div>
                          <span className="font-medium">{r.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            - {r.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="tenantSendInvitation"
                checked={sendInvitation}
                onCheckedChange={(checked) => setSendInvitation(checked === true)}
              />
              <Label
                htmlFor="tenantSendInvitation"
                className="text-sm font-normal cursor-pointer"
              >
                Send Invitation Email
              </Label>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {canInvite ? 'Cancel' : 'Close'}
          </Button>
          {canInvite && (
            <Button onClick={handleSendInvite} disabled={!canSend}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {sendInvitation ? 'Sending...' : 'Adding...'}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {sendInvitation ? 'Send Invitation' : 'Add User'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Upgrade Modal */}
      {tenantType && (
        <UpgradeModal
          open={upgradeModalOpen}
          onOpenChange={setUpgradeModalOpen}
          tenantId={tenantId}
          currentPlan={tenantType}
          triggerType="seat_limit_reached"
        />
      )}
    </Dialog>
  );
}
