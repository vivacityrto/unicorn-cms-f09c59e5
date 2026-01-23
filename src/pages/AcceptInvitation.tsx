import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, Lock, User, Phone } from 'lucide-react';
import unicornLogo from '@/assets/unicorn-logo-login.png';

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
  } | null>(null);

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
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

      const inviteQuery = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle() as any;

      if (inviteQuery.error) {
        throw new Error(inviteQuery.error.message || 'Failed to validate invitation');
      }

      if (!inviteQuery.data) {
        throw new Error('Invalid or expired invitation token');
      }

      const data = inviteQuery.data;

      if (data.status !== 'pending') {
        throw new Error('This invitation has already been used');
      }

      if (new Date(data.expires_at) < new Date()) {
        throw new Error('This invitation has expired');
      }

      // Determine user type based on tenant_id (319 is Vivacity tenant)
      const VIVACITY_TENANT_ID = 319;
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
      });
      
      // Pre-populate form fields with invitation data
      setFormData(prev => ({
        ...prev,
        firstName: data.first_name || '',
        lastName: data.last_name || '',
      }));
    } catch (error: any) {
      toast({
        title: 'Invalid invitation',
        description: error.message || 'Unable to validate invitation',
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  const hashToken = async (token: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
            unicorn_role: invitationData!.userType === 'vivacity' ? 'Super Admin' : 'User',
            user_type: invitationData!.userType === 'vivacity' ? 'Vivacity' : 'Client',
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
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
          // Password doesn't match their existing account
          toast({
            title: 'Account already exists',
            description: 'An account with this email already exists. Please log in with your existing password, or use "Forgot Password" to reset it.',
            variant: 'destructive',
          });
          setTimeout(() => navigate('/'), 2000);
          return;
        }

        // Sign in successful - update invitation status and redirect
        if (signInData.user) {
          const tokenHash = await hashToken(token!);
          await supabase
            .from('user_invitations')
            .update({ status: 'successful' })
            .eq('token_hash', tokenHash);
          
          toast({
            title: 'Welcome back!',
            description: 'Your account was already set up. Redirecting to dashboard...',
          });
          setTimeout(() => navigate('/dashboard'), 1500);
          return;
        }
      }

      if (signUpError) throw signUpError;

      // Mark invitation as successful
      if (authData.user) {
        const tokenHash = await hashToken(token!);
        const { error: updateError } = await supabase
          .from('user_invitations')
          .update({ status: 'successful' })
          .eq('token_hash', tokenHash);
        
        if (updateError) {
          console.error('Failed to update invitation status:', updateError);
        }
      }

      toast({
        title: 'Account created successfully',
        description: 'Redirecting...',
      });

      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error: any) {
      toast({
        title: 'Signup failed',
        description: error.message,
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

  if (!invitationData) {
    return null;
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
