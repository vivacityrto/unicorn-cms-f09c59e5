import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import unicornLogo from "@/assets/unicorn-logo-login.png";

const SUPABASE_URL = "https://yxkgdalkbrriasiyyrwk.supabase.co";

const ActivateAccount = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type") || "recovery";
  const email = searchParams.get("email");

  const handleActivate = () => {
    if (!token) return;
    const redirectTo = `${window.location.origin}/reset-password`;
    window.location.href = `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(
      token
    )}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  };

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
          {!token ? (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-3">Invalid Link</h2>
              <p className="text-muted-foreground">
                This link is invalid. Please contact your administrator.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Activate Your Account</h2>
                {email ? (
                  <p className="text-muted-foreground">
                    You're setting up your password for <span className="font-semibold text-foreground">{email}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Click below to set up your password.</p>
                )}
              </div>

              <Button
                type="button"
                onClick={handleActivate}
                className="w-full h-12 rounded-xl bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white font-semibold"
              >
                Set Up My Password
              </Button>

              <p className="text-xs text-muted-foreground text-center mt-4">
                This link can only be used once and expires in 1 hour.
              </p>
            </>
          )}
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

export default ActivateAccount;
