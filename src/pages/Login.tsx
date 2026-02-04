import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import unicornLogo from "@/assets/unicorn-logo-login.png";
import { LogIn, KeyRound, Sparkles } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Login successful",
        description: "Redirecting...",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use custom edge function instead of Supabase built-in (SMTP is misconfigured)
      const response = await fetch(
        "https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/send-self-password-reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a2dkYWxrYnJyaWFzaXl5cndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2MjQwMzEsImV4cCI6MjA2MzIwMDAzMX0.bBFTaO-6Afko1koQqx-PWdzl2mu5qmE0xWNTvneqyqY",
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || result.code || "Failed to send reset email");
      }

      toast({
        title: "Password reset email sent",
        description: "If an account exists with this email, you'll receive a reset link shortly.",
      });
      setShowForgotPassword(false);
    } catch (error: any) {
      console.error("Password reset error:", error);
      
      toast({
        title: "Password Reset Error",
        description: error.message || "Unable to send password reset email. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;

      toast({
        title: "Magic link sent",
        description: "Check your email for the login link",
      });
      setShowMagicLink(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  const getHeaderTitle = () => {
    if (showForgotPassword) return "Reset Password";
    if (showMagicLink) return "Magic Link";
    return "Welcome Back";
  };

  const getHeaderIcon = () => {
    if (showForgotPassword) return <KeyRound className="h-5 w-5" />;
    if (showMagicLink) return <Sparkles className="h-5 w-5" />;
    return <LogIn className="h-5 w-5" />;
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)" }}
    >
      <div className="w-full max-w-md">
        {/* Login Form Card - Matching Settings page style */}
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-muted/30 px-6 py-0 h-[84px] border-b border-border/50 flex items-center justify-between">
            <img src={unicornLogo} alt="Unicorn" className="h-16 w-auto" width="127" height="69" fetchPriority="high" />
            {getHeaderIcon()}
          </div>
          <CardContent className="p-6">
            {!showForgotPassword && !showMagicLink ? (
              <>
                <h2 className="font-semibold text-lg mb-1">{getHeaderTitle()}</h2>
                <p className="text-muted-foreground text-sm mb-6">Sign in to access your compliance system</p>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="h-11 rounded-lg border-0 bg-muted/50 ring-1 ring-border/50 hover:ring-border focus:ring-2 focus:ring-primary/30"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground font-medium">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-11 rounded-lg border-0 bg-muted/50 ring-1 ring-border/50 hover:ring-border focus:ring-2 focus:ring-primary/30"
                      required
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      className="border-secondary data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
                    />
                    <label
                      htmlFor="remember"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Remember me
                    </label>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 rounded-lg bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white font-semibold"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Log In"}
                  </Button>
                </form>

                {/* Alternative Login Options */}
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 text-[hsl(188_74%_51%)] hover:text-[hsl(188_74%_41%)] hover:bg-transparent font-semibold text-sm"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot Password?
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 text-[hsl(188_74%_51%)] hover:text-[hsl(188_74%_41%)] hover:bg-transparent font-semibold text-sm"
                    onClick={() => setShowMagicLink(true)}
                  >
                    Send Magic Link
                  </Button>
                </div>

              </>
            ) : showForgotPassword ? (
              <div className="space-y-6">
                <p className="text-muted-foreground text-sm">Enter your email to receive a password reset link</p>

                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-foreground font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="h-11 rounded-lg border-0 bg-muted/50 ring-1 ring-border/50 hover:ring-border focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 rounded-lg"
                    onClick={() => setShowForgotPassword(false)}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-11 rounded-lg bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-muted-foreground text-sm">Enter your email to receive a passwordless login link</p>

                <div className="space-y-2">
                  <Label htmlFor="magic-email" className="text-foreground font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="magic-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="h-11 rounded-lg border-0 bg-muted/50 ring-1 ring-border/50 hover:ring-border focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11 rounded-lg"
                    onClick={() => setShowMagicLink(false)}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 h-11 rounded-lg bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                    onClick={handleMagicLink}
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Send Magic Link"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Powered by Vivacity Footer */}
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
};

export default Login;
