import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientActingUser } from "@/hooks/useClientActingUser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2, Save, Shield, Building2, User } from "lucide-react";
import { toast } from "sonner";

export default function ClientProfilePage() {
  const { user } = useAuth();
  const { activeTenantId, isPreview, isReadOnly, tenantName } = useClientTenant();
  const { actingUser, isLoading: actingUserLoading, error: actingUserError } = useClientActingUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Notification prefs
  const [notifyEvents, setNotifyEvents] = useState(true);
  const [notifyReminders, setNotifyReminders] = useState(true);
  const [notifyDocs, setNotifyDocs] = useState(true);

  // Populate form when acting user loads
  useEffect(() => {
    if (actingUser) {
      setFirstName(actingUser.first_name || "");
      setLastName(actingUser.last_name || "");
      setPhone(actingUser.phone || actingUser.mobile_phone || "");
      setJobTitle(actingUser.job_title || "");
      setEmail(actingUser.email || "");
    }
  }, [actingUser]);

  const getInitials = () => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    return email?.substring(0, 2).toUpperCase() || "U";
  };

  const handleSave = async () => {
    if (isReadOnly || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          job_title: jobTitle || null,
        })
        .eq("user_uuid", user.id);

      if (error) throw error;
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error("Failed to update profile: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (actingUserLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (actingUserError) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Card className="border-destructive">
          <CardContent className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-destructive font-medium">{actingUserError}</p>
            <p className="text-sm text-muted-foreground">
              A Vivacity Team member can configure the parent account in the Users tab for this tenant.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(270 47% 26%)" }}>
          Profile Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account details and notification preferences
        </p>
      </div>

      {/* Read-only banner for preview */}
      {isReadOnly && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: "hsl(270 20% 95%)",
            color: "hsl(270 55% 41%)",
            border: "1px solid hsl(270 20% 88%)",
          }}
        >
          <Shield className="h-4 w-4 flex-shrink-0" />
          Read-only preview mode — profile edits are disabled
        </div>
      )}

      {/* My Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" style={{ color: "hsl(270 55% 41%)" }} />
            <div>
              <CardTitle className="text-lg">My Profile</CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2" style={{ borderColor: "hsl(270 20% 88%)" }}>
              <AvatarImage src={actingUser?.avatar_url || ""} />
              <AvatarFallback
                className="text-lg font-semibold"
                style={{ backgroundColor: "hsl(270 20% 88%)", color: "hsl(270 55% 41%)" }}
              >
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{firstName} {lastName}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="jobTitle">Position Title</Label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g. Compliance Manager"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organisation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5" style={{ color: "hsl(270 55% 41%)" }} />
            <div>
              <CardTitle className="text-lg">Organisation</CardTitle>
              <CardDescription>Your organisation details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Organisation Name</Label>
              <Input value={tenantName || "—"} disabled className="bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notification Preferences</CardTitle>
          <CardDescription>Choose what you'd like to be notified about</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Events & Meetings</p>
              <p className="text-xs text-muted-foreground">Calendar invites and event reminders</p>
            </div>
            <Switch checked={notifyEvents} onCheckedChange={setNotifyEvents} disabled={isReadOnly} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Task Reminders</p>
              <p className="text-xs text-muted-foreground">Upcoming due dates and overdue items</p>
            </div>
            <Switch checked={notifyReminders} onCheckedChange={setNotifyReminders} disabled={isReadOnly} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Document Updates</p>
              <p className="text-xs text-muted-foreground">New documents and version changes</p>
            </div>
            <Switch checked={notifyDocs} onCheckedChange={setNotifyDocs} disabled={isReadOnly} />
          </div>
        </CardContent>
      </Card>

      {/* Save button (only in real client mode) */}
      {!isReadOnly && (
        <div className="flex justify-end pb-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
