import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Puzzle, 
  Mail, 
  Calendar, 
  FileText, 
  AlertTriangle,
  Info
} from "lucide-react";
import { useAddinFeatureFlags, AddinFeatureFlags } from "@/hooks/useAddinFeatureFlags";

export default function AddinSettings() {
  const { flags, isLoading, isUpdating, updateFlags } = useAddinFeatureFlags();

  const handleToggle = (key: keyof AddinFeatureFlags, value: boolean) => {
    updateFlags({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Puzzle className="h-8 w-8" />
          Microsoft Add-in Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Control feature flags for the Unicorn Microsoft Office Add-in
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          These flags control the availability of add-in features across all Vivacity Team users.
          Changes take effect immediately but may require users to refresh the add-in.
        </AlertDescription>
      </Alert>

      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Puzzle className="h-5 w-5" />
                Microsoft Add-in
                <Badge variant={flags.microsoft_addin_enabled ? "default" : "secondary"}>
                  {flags.microsoft_addin_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Master toggle for the entire Microsoft Add-in functionality
              </CardDescription>
            </div>
            <Switch
              checked={flags.microsoft_addin_enabled}
              onCheckedChange={(checked) => handleToggle("microsoft_addin_enabled", checked)}
              disabled={isUpdating}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Feature Toggles */}
      <Card className={!flags.microsoft_addin_enabled ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle>Add-in Surfaces</CardTitle>
          <CardDescription>
            Enable or disable specific surfaces within the Microsoft Add-in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!flags.microsoft_addin_enabled && (
            <Alert variant="default" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Enable the master toggle above to configure individual surfaces.
              </AlertDescription>
            </Alert>
          )}

          {/* Outlook Mail */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <Label htmlFor="outlook-mail" className="font-medium">
                  Outlook Mail
                </Label>
                <p className="text-sm text-muted-foreground">
                  Link emails, create tasks, and save attachments from Outlook
                </p>
              </div>
            </div>
            <Switch
              id="outlook-mail"
              checked={flags.addin_outlook_mail_enabled}
              onCheckedChange={(checked) => handleToggle("addin_outlook_mail_enabled", checked)}
              disabled={isUpdating || !flags.microsoft_addin_enabled}
            />
          </div>

          <Separator />

          {/* Meetings */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Calendar className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <Label htmlFor="meetings" className="font-medium">
                  Meetings & Calendar
                </Label>
                <p className="text-sm text-muted-foreground">
                  Link meetings, log time drafts, and capture notes from calendar
                </p>
              </div>
            </div>
            <Switch
              id="meetings"
              checked={flags.addin_meetings_enabled}
              onCheckedChange={(checked) => handleToggle("addin_meetings_enabled", checked)}
              disabled={isUpdating || !flags.microsoft_addin_enabled}
            />
          </div>

          <Separator />

          {/* Documents */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <Label htmlFor="documents" className="font-medium">
                  Documents
                </Label>
                <p className="text-sm text-muted-foreground">
                  Link and manage SharePoint/OneDrive documents from Word and Excel
                </p>
              </div>
            </div>
            <Switch
              id="documents"
              checked={flags.addin_documents_enabled}
              onCheckedChange={(checked) => handleToggle("addin_documents_enabled", checked)}
              disabled={isUpdating || !flags.microsoft_addin_enabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg border">
              <Puzzle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Add-in</p>
              <Badge variant={flags.microsoft_addin_enabled ? "default" : "outline"}>
                {flags.microsoft_addin_enabled ? "On" : "Off"}
              </Badge>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <Mail className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Mail</p>
              <Badge variant={flags.microsoft_addin_enabled && flags.addin_outlook_mail_enabled ? "default" : "outline"}>
                {flags.microsoft_addin_enabled && flags.addin_outlook_mail_enabled ? "On" : "Off"}
              </Badge>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Meetings</p>
              <Badge variant={flags.microsoft_addin_enabled && flags.addin_meetings_enabled ? "default" : "outline"}>
                {flags.microsoft_addin_enabled && flags.addin_meetings_enabled ? "On" : "Off"}
              </Badge>
            </div>
            <div className="text-center p-4 rounded-lg border">
              <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Documents</p>
              <Badge variant={flags.microsoft_addin_enabled && flags.addin_documents_enabled ? "default" : "outline"}>
                {flags.microsoft_addin_enabled && flags.addin_documents_enabled ? "On" : "Off"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
