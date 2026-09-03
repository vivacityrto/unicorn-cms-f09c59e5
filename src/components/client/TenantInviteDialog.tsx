import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { checkSeatAvailability, UPGRADE_PATHS } from '@/hooks/useSeatLimits';
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
import { Loader2, Shield, User as UserIcon, AlertTriangle, Users, UserPlus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { TenantType } from '@/contexts/TenantTypeContext';
import {
  type RelationshipRole,
  RELATIONSHIP_ROLE_OPTIONS,
  isValidEmail,
  unicornRoleFromRelationship,
} from '@/lib/roles/relationshipRole';

interface TenantInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName: string;
  onSuccess?: () => void;
}

const VIVACITY_TENANT_ID = 6372;

const VIVACITY_ROLES = [
  { value: 'Super Admin', label: 'Super Admin', description: 'Full Vivacity admin access', icon: Shield },
  { value: 'Team Leader', label: 'Team Leader', description: 'Leads a Vivacity team', icon: Shield },
  { value: 'Team Member', label: 'Team Member', description: 'Vivacity staff member', icon: UserIcon },
];

const CLIENT_ROLES = [
  { value: 'Admin', label: 'Admin', description: 'Can manage users and settings', icon: Shield },
  { value: 'User', label: 'General User', description: 'Standard access to features', icon: UserIcon },
];

const getRoleOptions = (tid: number) =>
  tid === VIVACITY_TENANT_ID ? VIVACITY_ROLES : CLIENT_ROLES;

const getDefaultRole = (tid: number) =>
  tid === VIVACITY_TENANT_ID ? 'Team Member' : 'user';

export function TenantInviteDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onSuccess,
}: TenantInviteDialogProps) {
  const { session } = useAuth();
  const isClientTenant = tenantId !== VIVACITY_TENANT_ID;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  // For client tenants, `role` holds a RelationshipRole value; for Vivacity, an unicorn_role string.
  const [role, setRole] = useState<string>(() => getDefaultRole(tenantId));
  const [isSending, setIsSending] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(false);
  const [position, setPosition] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Existing relationship-role occupancy for client tenants (which slots are taken)
  const [primaryTaken, setPrimaryTaken] = useState(false);
  const [secondaryTaken, setSecondaryTaken] = useState(false);

  // Seat limit state
  const [checkingSeats, setCheckingSeats] = useState(true);
  const [canInvite, setCanInvite] = useState(true);
  const [currentUsers, setCurrentUsers] = useState(0);
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [seatMessage, setSeatMessage] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<TenantType | null>(null);

  // Reset role default whenever the dialog opens or tenant changes
  useEffect(() => {
    setRole(getDefaultRole(tenantId));
  }, [tenantId, open]);

  // For client tenants: fetch existing primary/secondary occupancy so we can
  // disable those options in the dropdown.
  useEffect(() => {
    if (!open || !isClientTenant) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tenant_users')
        .select('relationship_role, primary_contact, secondary_contact, role')
        .eq('tenant_id', tenantId);
      if (cancelled || error) return;
      const rows = data ?? [];
      const hasPrimary = rows.some((r: any) =>
        r.relationship_role === 'primary_contact' ||
        (!r.relationship_role && (r.primary_contact === true || r.role === 'parent')),
      );
      const hasSecondary = rows.some((r: any) =>
        r.relationship_role === 'secondary_contact' ||
        (!r.relationship_role && r.secondary_contact === true),
      );
      setPrimaryTaken(hasPrimary);
      setSecondaryTaken(hasSecondary);
    })();
    return () => { cancelled = true; };
  }, [open, tenantId, isClientTenant]);

  const checkSeats = useCallback(async () => {
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
  }, [tenantId]);

  // Check seat availability when dialog opens
  useEffect(() => {
    if (open && tenantId) {
      checkSeats();
    }
  }, [open, tenantId, checkSeats]);

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole(getDefaultRole(tenantId));
    setPosition('');
    setPhoneNumber('');
    setSendInvitation(false);
    onOpenChange(false);
  };

  /**
   * Smart paste: detect "Name <email>", "Name (email)", a bare email, or
   * "First Last" pasted into the First Name field and distribute across
   * First/Last/Email accordingly. Returns true if handled.
   */
  const handleSmartPaste = (text: string): boolean => {
    const raw = text.trim();
    if (!raw) return false;

    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

    // Pattern 1: "Name <email>" or "Name (email)"
    const nameEmailMatch = raw.match(/^(.+?)\s*[<(]\s*([^<>()\s]+@[^<>()\s]+)\s*[>)]?\s*$/i);
    if (nameEmailMatch && emailRegex.test(nameEmailMatch[2])) {
      const namePart = nameEmailMatch[1].trim().replace(/^["']|["']$/g, '').trim();
      const emailPart = nameEmailMatch[2].trim();
      const parts = namePart.split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' '));
      setEmail(emailPart);
      toast.success('Contact details parsed from paste');
      return true;
    }

    // Pattern 2: bare email
    if (emailRegex.test(raw) && !/\s/.test(raw)) {
      setEmail(raw);
      if (!firstName) {
        const local = raw.split('@')[0].split(/[._-]/)[0];
        if (local) setFirstName(local.charAt(0).toUpperCase() + local.slice(1));
      }
      toast.success('Email parsed from paste');
      return true;
    }

    // Pattern 3: "First Last" (multi-word, no email)
    if (!emailRegex.test(raw) && /\s/.test(raw)) {
      const parts = raw.split(/\s+/);
      setFirstName(parts[0]);
      setLastName(parts.slice(1).join(' '));
      return true;
    }

    return false;
  };

  const handleSendInvite = async () => {
    if (!firstName.trim() || !email.trim()) {
      toast.error('Please fill in required fields');
      return;
    }

    if (!isValidEmail(email)) {
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

      // For client tenants, `role` is a RelationshipRole and we derive
      // the legacy unicorn_role from it. The edge function will use
      // relationship_role as the source of truth.
      const isClient = tenantId !== VIVACITY_TENANT_ID;
      const relationshipRole: RelationshipRole | null = isClient
        ? (role as RelationshipRole)
        : null;
      const unicornRole = isClient
        ? unicornRoleFromRelationship(relationshipRole as RelationshipRole)
        : role;

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email.toLowerCase().trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          invite_as: isClient ? 'CLIENT' : 'VIVACITY',
          tenant_id: tenantId,
          unicorn_role: unicornRole,
          relationship_role: relationshipRole,
          skip_email: !sendInvitation,
          job_title: position.trim() || null,
          phone_number: phoneNumber.trim() || null,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success(sendInvitation ? `Invitation sent to ${email}` : `${firstName} added to ${tenantName}`);
        handleClose();
        onSuccess?.();
      } else if (data?.code === 'PRIMARY_EXISTS' || data?.code === 'SECONDARY_EXISTS') {
        toast.error(data?.detail || 'This organisation already has a contact in that role.');
        // keep dialog open so the user can pick a different role
      } else {
        toast.error(data?.detail || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error?.message || 'Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  const roleSlotTaken = isClientTenant && (
    (role === 'primary_contact' && primaryTaken) ||
    (role === 'secondary_contact' && secondaryTaken)
  );
  const canSend = firstName.trim() && email.trim() && role && !isSending && canInvite && !checkingSeats && !roleSlotTaken;

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
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (handleSmartPaste(pasted)) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="John"
                />
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Tip: paste <code className="font-mono">Name &lt;email@example.com&gt;</code> to auto-fill all fields.
                </p>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. Training Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 0412 345 678"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              {isClientTenant ? (
                <>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_ROLE_OPTIONS.map((opt) => {
                        const taken =
                          (opt.value === 'primary_contact' && primaryTaken) ||
                          (opt.value === 'secondary_contact' && secondaryTaken);
                        return (
                          <SelectItem key={opt.value} value={opt.value} disabled={taken}>
                            <div className="flex items-center gap-2">
                              {opt.value === 'primary_contact' && <Shield className="h-4 w-4" />}
                              {opt.value === 'secondary_contact' && <UserCheck className="h-4 w-4" />}
                              {(opt.value === 'user' || opt.value === 'academy_user') && <UserIcon className="h-4 w-4" />}
                              <div>
                                <span className="font-medium">{opt.label}</span>
                                <span className="text-muted-foreground ml-2 text-xs">
                                  - {opt.description}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {role === 'primary_contact' && primaryTaken && (
                    <p className="text-[11px] text-destructive">
                      This organisation already has a primary contact. Demote them first to invite a new one.
                    </p>
                  )}
                  {role === 'secondary_contact' && secondaryTaken && (
                    <p className="text-[11px] text-destructive">
                      This organisation already has a secondary contact. Demote them first to invite a new one.
                    </p>
                  )}
                </>
              ) : (
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getRoleOptions(tenantId).map((r) => (
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
              )}
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
                Send Invitation
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
    </Dialog>
  );
}
