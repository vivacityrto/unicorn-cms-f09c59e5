import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Building2, UserPlus } from "lucide-react";

type InviteData = {
  email: string;
  tenant_id: number;
};

type ReInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableEmails: string[];
  availableTenants: { id: number; name: string }[];
};

export default function ReInviteDialog({
  open,
  onOpenChange,
  availableEmails,
  availableTenants,
}: ReInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !tenantId) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the invite-user edge function to re-send invitation
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          tenant_id: parseInt(tenantId),
          role: "CLIENT_USER", // Default role for re-invite
        },
      });

      if (error) throw error;

      toast.success("Invitation re-sent successfully!");
      setEmail("");
      setTenantId("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error re-inviting user:", error);
      toast.error(error.message || "Failed to re-send invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-[3px] border-[#dfdfdf]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5" />
            Re-invite User
          </DialogTitle>
          <DialogDescription>
            Select an email and tenant to re-send the invitation.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address
            </Label>
            <Combobox
              options={availableEmails.map((emailOption) => ({
                value: emailOption,
                label: emailOption,
              }))}
              value={email}
              onValueChange={setEmail}
              placeholder="Select email from visible invites"
              searchPlaceholder="Search emails..."
              emptyText="No emails found."
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Tenant
            </Label>
            <Combobox
              options={availableTenants.map((tenant) => ({
                value: tenant.id.toString(),
                label: tenant.name,
              }))}
              value={tenantId}
              onValueChange={setTenantId}
              placeholder="Select tenant from visible invites"
              searchPlaceholder="Search tenants..."
              emptyText="No tenants found."
              className="h-11"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Re-send Invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
