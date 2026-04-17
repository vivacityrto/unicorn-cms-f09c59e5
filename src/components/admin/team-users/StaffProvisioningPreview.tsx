import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Eye, Mail, Code2, Users2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { StaffProvisioningRule } from "@/hooks/useStaffProvisioningRules";

interface Props {
  firstName: string;
  lastName: string;
  displayName: string;
  upn: string;
  tempPassword: string;
  roleCode: string;
  locationCode: string;
  rule: StaffProvisioningRule;
  psScript: string;
}

export function StaffProvisioningPreview({
  displayName, upn, tempPassword, roleCode, locationCode, rule, psScript,
}: Props) {
  const { toast } = useToast();
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" /> 4. Review &amp; preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="checklist">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="checklist"><Users2 className="h-4 w-4 mr-1" /> Checklist</TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1" /> Email preview</TabsTrigger>
            <TabsTrigger value="script"><Code2 className="h-4 w-4 mr-1" /> PowerShell</TabsTrigger>
          </TabsList>

          <TabsContent value="checklist" className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/20 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Display name:</span> <span className="font-medium">{displayName}</span></div>
              <div><span className="text-muted-foreground">UPN:</span> <span className="font-mono">{upn}</span></div>
              <div><span className="text-muted-foreground">Role / Location:</span> <Badge variant="outline">{roleCode}</Badge> <Badge variant="outline">{locationCode}</Badge></div>
            </div>

            <Section title="M365 Groups" items={rule.m365_groups} variant="default" />
            <Section title="Licenses (SKU)" items={rule.licenses} variant="secondary" />
            <Section title="Software accounts (manual)" items={rule.software} variant="outline" />
            <Section title="Calendar invites (manual)" items={rule.calendars} variant="outline" />
          </TabsContent>

          <TabsContent value="email">
            <div className="rounded-lg border p-4 bg-muted/20 text-sm whitespace-pre-wrap font-sans">
{`Hi ,

Here are the login and other details for our new person '${displayName}' in ${locationCode}.

  Role:               ${roleCode}
  Vivacity login:     ${upn}
  Temporary password: ${tempPassword}   (must be changed at first sign-in)
  M365 access:        Desktop / Web apps
  Groups:             ${rule.m365_groups.join(", ")}
  Software pending:   ${rule.software.join(", ")}
  Calendar invites:   ${rule.calendars.join(", ")}

Vivacity main number: 1300 772 459
Client Support email: support@vivacity.com.au

Let me know if you need anything else.`}
            </div>
          </TabsContent>

          <TabsContent value="script">
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="outline" onClick={() => copy(psScript, "PowerShell script")}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
            </div>
            <pre className="rounded-lg border p-4 bg-foreground text-background text-xs font-mono overflow-auto max-h-96">
{psScript}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              Audit fallback only — actual provisioning runs through the Graph API on the next step.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Section({ title, items, variant }: { title: string; items: string[]; variant: "default" | "secondary" | "outline" }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1.5">{title} <span className="text-muted-foreground">({items.length})</span></div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">None</span>
        ) : (
          items.map((it) => <Badge key={it} variant={variant}>{it}</Badge>)
        )}
      </div>
    </div>
  );
}
