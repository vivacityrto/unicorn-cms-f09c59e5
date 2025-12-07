import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import unicornLogo from "@/assets/unicorn-logo-login.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    // Check if we have a valid session from the reset link
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidToken(true);
      } else {
        toast({
          title: "Invalid or expired link",
          description: "Please request a new password reset link",
          variant: "destructive",
        });
        setTimeout(() => navigate("/login"), 3000);
      }
    });
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been successfully reset",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      setTimeout(() => navigate("/login"), 2000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isValidToken) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center p-4"
        style={{ backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)" }}
      >
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <img src={unicornLogo} alt="Unicorn Compliance Management System" className="w-full h-auto max-w-[18rem]" />
          </div>
          <div className="bg-white rounded-xl p-6 shadow-2xl text-center">
            <p className="text-muted-foreground">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ backgroundImage: "linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%)" }}
    >
      <div className="w-full max-w-md space-y-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <img src={unicornLogo} alt="Unicorn Compliance Management System" className="w-full h-auto max-w-[18rem]" />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-1">Reset Your Password</h2>
            <p className="text-muted-foreground">Enter your new password below</p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-semibold">
                New Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="h-12 rounded-xl"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-semibold">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="h-12 rounded-xl"
                required
                minLength={6}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>

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

export default ResetPassword;
