import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import unicornLogo from "@/assets/unicorn-logo-login.png";

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
        navigate("/manage-packages");
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

      navigate("/manage-packages");
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: "Check your email for the password reset link",
      });
      setShowForgotPassword(false);
    } catch (error: any) {
      console.error("Password reset error:", error);
      
      // Provide user-friendly error messages
      let errorMessage = "Unable to send password reset email. Please try again later.";
      
      if (error.message?.includes("Email") || error.message?.includes("email")) {
        errorMessage = "There was a problem sending the reset email. Please contact support or try using the Magic Link option instead.";
      } else if (error.message?.includes("User not found")) {
        errorMessage = "No account found with this email address.";
      } else if (error.message?.includes("rate limit")) {
        errorMessage = "Too many requests. Please wait a few minutes and try again.";
      }
      
      toast({
        title: "Password Reset Error",
        description: errorMessage,
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
          emailRedirectTo: `${window.location.origin}/manage-packages`,
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

  const fillDemoCredentials = () => {
    setEmail("angela@vivacity.com.au");
    setPassword("password123");
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)" }}
    >
      <div className="w-full max-w-md space-y-4">
        {/* Logo Section */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <img src={unicornLogo} alt="Unicorn Compliance Management System" className="w-full h-auto max-w-[18rem]" />
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl p-6 shadow-2xl">
          {!showForgotPassword && !showMagicLink ? (
            <>
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-foreground mb-1">Welcome Back</h2>
                <p className="text-muted-foreground">Sign in to access your compliance system</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground font-semibold">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="h-12 rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground font-semibold">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 rounded-xl"
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
                  className="w-full h-12 rounded-xl bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white font-semibold"
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
                  className="flex-1 text-[hsl(188_74%_51%)] hover:text-[hsl(188_74%_41%)] hover:bg-transparent font-semibold"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Forgot Password?
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 text-[hsl(188_74%_51%)] hover:text-[hsl(188_74%_41%)] hover:bg-transparent font-semibold"
                  onClick={() => setShowMagicLink(true)}
                >
                  Send Magic Link
                </Button>
              </div>

              {/* Demo Login Info */}
              <div className="mt-4 bg-muted rounded-xl p-3 text-center">
                <p className="text-foreground font-semibold mb-2">Demo Login:</p>
                <p className="text-sm text-muted-foreground">
                  Email:{" "}
                  <button
                    type="button"
                    onClick={fillDemoCredentials}
                    className="text-foreground hover:text-[hsl(188_74%_51%)] underline transition-colors"
                  >
                    angela@vivacity.com.au
                  </button>
                </p>
                <p className="text-sm text-muted-foreground">Password: password123</p>
              </div>
            </>
          ) : showForgotPassword ? (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">Reset Password</h2>
                <p className="text-muted-foreground">Enter your email to receive a password reset link</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-foreground font-semibold">
                  Email Address
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="h-12 rounded-xl"
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 rounded-xl"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-12 rounded-xl bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">Magic Link</h2>
                <p className="text-muted-foreground">Enter your email to receive a passwordless login link</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="magic-email" className="text-foreground font-semibold">
                  Email Address
                </Label>
                <Input
                  id="magic-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="h-12 rounded-xl"
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 rounded-xl"
                  onClick={() => setShowMagicLink(false)}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-12 rounded-xl bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
                  onClick={handleMagicLink}
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Send Magic Link"}
                </Button>
              </div>
            </div>
          )}
        </div>

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
