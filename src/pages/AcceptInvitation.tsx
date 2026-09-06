import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, Lock, User, Phone } from 'lucide-react';
import unicornLogo from '@/assets/unicorn-logo-login.png';

interface InvitationTokenResult {
  status?: string;
  expires_at?: string;
  email?: string;
  tenant_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  unicorn_role?: string | null;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to validate invitation';
}

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [isLoading, setIsLoading] = useState(false);
  const [validating, setValidating] = useState(true);
const [invitationData, setInvitationData] = useState<{
    email: string;
    tenantId: number | null;
    userType: 'vivacity' | 'client';
    tenantName: string | null;
    firstName: string | null;
    lastName: string | null;
    unicornRole: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const validateToken = useCallback(async () => {
    if (!token) {
      toast({
        title: 'Invalid invitation',
        description: 'No invitation token provided',
        variant: 'destructive',
      });
      setValidating(false);
      return;
    }

    setValidating(true);
    try {
      const tokenHash = await hashToken(token);

      const { data: rpcResult, error: rpcError } = await supabase.rpc('validate_invitation_token', {
        p_token_hash: tokenHash,
      });

      if (rpcError) {
        throw new Error('Failed to validate invitation');
      }

      const result = rpcResult as InvitationTokenResult | null;

      if (!result) {
        throw new Error('Invitation validation returned no result');
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      const data = result;

      if (data.status !== 'pending') {
        throw new Error('This invitation has already been used');
      }

      if (new Date(data.expires_at) < new Date()) {
        throw new Error('This invitation has expired');
      }

      // Determine user type based on tenant_id (6372 is Vivacity tenant)
      const VIVACITY_TENANT_ID = 6372;
      const isVivacity = data.tenant_id === VIVACITY_TENANT_ID;
      
      // Fetch tenant name
      let tenantName: string | null = null;
      if (data.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', data.tenant_id)
          .maybeSingle();
        
        tenantName = tenantData?.name || null;
      }
      
setInvitationData({
        email: data.email,
        tenantId: data.tenant_id,
        userType: isVivacity ? 'vivacity' : 'client',
        tenantName,
        firstName: data.first_name || null,
        lastName: data.last_name || null,
        unicornRole: data.unicorn_role || (isVivacity ? 'Team Member' : 'User'),
      });
      
      // Pre-populate form fields with invitation data
      setFormData(prev => ({
        ...prev,
        firstName: data.first_name || '',
        lastName: data.last_name || '',
      }));
    } catch (error: unknown) {
      toast({
        title: 'Invalid invitation',
        description: errorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  }, [token, toast]);

  useEffect(() => {
    validateToken();
  }, [validateToken]);

  const hashToken = async (token: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  interface InvitationAcceptResult {
    ok: boolean;
    code: 'SUCCESS' | 'ALREADY_ACCEPTED' | 'EXPIRED' | 'INVALID_TOKEN' | 'INVALID_PARAMS' | string;
    message?: string;
    tenant_id?: number;
    role?: string;
    primary_contact?: boolean;
  }

  const finalizeInvitation = async (
    userId: string,
    tokenHash: string,
    options: { claimedPasswordActivation?: boolean } = {}
  ): Promise<{ ok: boolean; code: string; message?: string }> => {
    try {
      const rpcName = options.claimedPasswordActivation
        ? 'complete_claimed_invitation'
        : 'accept_invitation_v2';
      const { data: acceptResult, error: rpcError } = await supabase.rpc(rpcName, {
        p_token_hash: tokenHash,
        p_user_id: userId,
      });

      if (rpcError) {
        console.error('RPC error finalizing invitation:', rpcError);
        return { ok: false, code: 'RPC_ERROR', message: rpcError.message };
      }

      const result = acceptResult as unknown as InvitationAcceptResult | null;

      if (!result) {
        return { ok: false, code: 'NO_RESULT' };
      }

      if (result.code === 'SUCCESS' || result.code === 'ALREADY_ACCEPTED') {
        console.log('Invitation finalized:', result);
        return { ok: true, code: result.code, message: result.message };
      }

      console.error('Failed to finalize invitation:', result);
      return { ok: false, code: result.code, message: result.message };
    } catch (error: unknown) {
      console.error('Error in finalizeInvitation:', error);
      return { ok: false, code: 'EXCEPTION', message: errorMessage(error) };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please ensure both passwords are identical',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const tokenHash = await hashToken(token!);
      
      // Sign up the user with all metadata for the trigger
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitationData!.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone || null,
            tenant_id: invitationData!.tenantId,
unicorn_role: invitationData!.unicornRole,
            user_type: invitationData!.userType === 'vivacity' ? 'Vivacity Team' : 'Client',
          },
          emailRedirectTo: `${window.location.origin}/post-sign-in?fresh=1`,
        },
      });

      // Handle "User already registered" case - try to sign them in instead
      if (signUpError?.message?.includes('already registered') || signUpError?.message?.includes('already exists')) {
        // User exists in auth, try to sign them in with the password they provided
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invitationData!.email,
          password: formData.password,
        });

        if (signInError) {
          // Try set-invite-password for ghost-activated accounts (have auth but no password)
          const { data: setPwData, error: setPwError } = await supabase.functions.invoke(
            'set-invite-password',
            {
              body: {
                token_plaintext: token,
                email: invitationData!.email,
                new_password: formData.password,
              },
            }
          );

          if (setPwError || !setPwData?.ok) {
            const code = setPwData?.code;
            if (code === 'NOT_GHOST_ACCOUNT') {
              toast({
                title: 'Account already exists',
                description: 'Please log in with your existing password, or use Forgot Password to reset it.',
                variant: 'destructive',
              });
              setTimeout(() => navigate('/'), 2000);
              return;
            }
            if (code === 'TOKEN_CONSUMED') {
              toast({
                title: 'Invitation already used',
                description: 'This invitation link has already been used. Please log in, or ask your administrator for a new one.',
                variant: 'destructive',
              });
              setTimeout(() => navigate('/'), 2000);
              return;
            }
            toast({
              title: 'Invitation expired',
              description: 'This invitation link has expired. Please ask your administrator for a new one.',
              variant: 'destructive',
            });
            return;
          }

          // Password set — now sign in with it
          const { data: signInRetry, error: retryError } = await supabase.auth.signInWithPassword({
            email: invitationData!.email,
            password: formData.password,
          });

          if (retryError || !signInRetry.user) {
            toast({
              title: 'Sign in failed',
              description: 'Password was set but sign in failed. Please try logging in directly.',
              variant: 'destructive',
            });
            setTimeout(() => navigate('/'), 2000);
            return;
          }

          // Finalize invitation
          const result = await finalizeInvitation(signInRetry.user.id, tokenHash, {
            claimedPasswordActivation: true,
          });
          if (!result.ok && result.code !== 'ALREADY_ACCEPTED') {
            toast({
              title: 'Setup incomplete',
              description: result.message || `Could not finalise your invitation (${result.code}). Contact your administrator.`,
              variant: 'destructive',
            });
            return;
          }

          toast({ title: 'Account activated!', description: 'Redirecting to your dashboard…' });
          setTimeout(() => navigate('/post-sign-in', { state: { fresh: true }, replace: true }), 1500);
          return;
        }


        // Sign in successful - finalize invitation and redirect
        if (signInData.user) {
          const result = await finalizeInvitation(signInData.user.id, tokenHash);

          if (!result.ok && result.code === 'EXPIRED') {
            toast({
              title: 'Invitation expired',
              description: 'This invitation has expired. Please ask your admin for a new one.',
              variant: 'destructive',
            });
            return;
          }

          toast({
            title: 'Welcome back!',
            description: 'Your account was already set up. Redirecting to dashboard...',
          });
          setTimeout(() => navigate('/post-sign-in', { state: { fresh: true }, replace: true }), 1500);
          return;
        }
      }

      if (signUpError) throw signUpError;

      // Finalize invitation - create tenant membership
      if (authData.user) {
        const result = await finalizeInvitation(authData.user.id, tokenHash);

        if (!result.ok) {
          if (result.code === 'EXPIRED') {
            toast({
              title: 'Invitation expired',
              description: 'This invitation has expired. Please ask your admin for a new one.',
              variant: 'destructive',
            });
            return;
          }
          if (result.code === 'INVALID_TOKEN') {
            toast({
              title: 'Invalid invitation',
              description: 'This invitation link is no longer valid.',
              variant: 'destructive',
            });
            return;
          }
          // Surface ALL other failures (RPC_ERROR, EXCEPTION, NO_RESULT, INVALID_PARAMS, etc.)
          // Previously these were swallowed with console.warn while showing a success toast.
          console.error('Finalize invitation failed:', result);
          toast({
            title: 'Account created, but setup failed',
            description:
              result.message ||
              `Could not finalize your invitation (${result.code}). Please contact your administrator before logging in.`,
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Account created successfully',
        description: 'Redirecting...',
      });

      setTimeout(() => navigate('/post-sign-in', { state: { fresh: true }, replace: true }), 1500);
    } catch (error: unknown) {
      toast({
        title: 'Signup failed',
        description: errorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)' }}>
        <div className="bg-white rounded-xl p-8 shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-center mt-4">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (!invitationData && !validating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <h2 className="text-xl font-semibold text-center">
          Invalid or expired invitation
        </h2>
        <p className="text-muted-foreground text-center max-w-sm">
          This invitation link may have expired or already been used.
          Please contact your administrator for a new invitation.
        </p>
        <Button variant="outline" onClick={validateToken}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ backgroundImage: 'linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)' }}>
      <div className="w-full max-w-md space-y-4">
        {/* Logo Section */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <img 
            src={unicornLogo} 
            alt="Unicorn Compliance Management System" 
            className="w-full h-auto max-w-[18rem]"
          />
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-1">Complete Your Signup</h2>
            <p className="text-sm text-muted-foreground">
              You've been invited as a <strong>{invitationData.userType === 'vivacity' ? 'Vivacity' : 'Client'}</strong> user
              {invitationData.tenantName && (
                <span className="block mt-1">RTO: <strong>{invitationData.tenantName}</strong></span>
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={invitationData.email}
                disabled
                className="bg-muted cursor-not-allowed opacity-60"
              />
            </div>

            {/* RTO Name (read-only) - only show if tenant name exists */}
            {invitationData.tenantName && (
              <div className="space-y-2">
                <Label htmlFor="rtoName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  RTO Name
                </Label>
                <Input
                  id="rtoName"
                  type="text"
                  value={invitationData.tenantName}
                  disabled
                  className="bg-muted cursor-not-allowed opacity-60"
                />
              </div>
            )}

            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                First Name
              </Label>
              <Input
                id="firstName"
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="John"
                required
              />
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Last Name
              </Label>
              <Input
                id="lastName"
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Doe"
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number (Optional)
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+61 400 000 000"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter your password"
                required
                minLength={8}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Complete Signup'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-white mt-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-sm">Powered by</span>
            <span className="font-bold text-lg">✒️ Vivacity</span>
          </div>
          <p className="text-xs tracking-wider">RTO + CRICOS SUPERHERO</p>
        </div>
      </div>
    </div>
  );
}
