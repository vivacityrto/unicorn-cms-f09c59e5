import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, CheckCircle2, Download, Mail, Eye } from "lucide-react";
import { useUserSetupLinks, type UserSetupLink } from "@/hooks/useUserSetupLinks";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  newStarter: {
    displayName: string;
    upn: string;
    tempPassword: string;
  };
  psScript?: string;
  onResendEmail?: () => void;
}

export function PostSaveSetupLinks({ newStarter, psScript, onResendEmail }: Props) {
  const { data: links = [], isLoading } = useUserSetupLinks();
  const { toast } = useToast();
  const [scriptOpen, setScriptOpen] = useState(false);

  const groups = links.reduce<Record<string, UserSetupLink[]>>((acc, l) => {
    const key = l.category === "m365" ? "Microsoft 365" : "Other systems";
    (acc[key] ||= []).push(l);
    return acc;
  }, {});

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const downloadScript = () => {
    if (!psScript) return;
    const blob = new Blob([psScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = newStarter.displayName.replace(/[^\w-]+/g, "_") || "new-starter";
    const a = document.createElement("a");
    a.href = url;
    a.download = `provision_${safeName}.ps1`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "PowerShell script downloaded" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" /> Next steps — external setup
        </CardTitle>
        <CardDescription>
          Open each system below to finish setting up <strong>{newStarter.displayName}</strong>.
          Copy the credentials as needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick credentials */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">UPN / sign-in</span>
            <div className="flex items-center gap-2">
              <code className="font-mono">{newStarter.upn}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(newStarter.upn, "UPN")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Temp password</span>
            <div className="flex items-center gap-2">
              <code className="font-mono">{newStarter.tempPassword}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(newStarter.tempPassword, "Password")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Regenerate / resend actions */}
        {(psScript || onResendEmail) && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h4 className="font-semibold text-sm">Regenerate &amp; resend</h4>
            <div className="flex flex-wrap gap-2">
              {psScript && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setScriptOpen(true)}>
                    <Eye className="h-4 w-4 mr-1.5" /> View PowerShell script
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadScript}>
                    <Download className="h-4 w-4 mr-1.5" /> Download .ps1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(psScript, "PowerShell script")}
                  >
                    <Copy className="h-4 w-4 mr-1.5" /> Copy script
                  </Button>
                </>
              )}
              {onResendEmail && (
                <Button variant="outline" size="sm" onClick={onResendEmail}>
                  <Mail className="h-4 w-4 mr-1.5" /> Resend team-leader email
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              The script is regenerated live from the resolved role/location rules — re-run it
              anytime if Graph auto-provisioning was incomplete.
            </p>
          </div>
        )}

        {isLoading && <div className="text-sm text-muted-foreground">Loading links…</div>}

        {Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{groupName}</h4>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3 rounded-lg border bg-card p-3 hover:border-primary hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      {link.label}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                    </div>
                    {link.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {link.description}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Manage these links in{" "}
          <Link
            to="/admin/code-tables?table=dd_usersetup_links"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Code Tables → dd_usersetup_links
          </Link>{" "}
          (Super Admin only).
        </p>
      </CardContent>

      {/* Script preview dialog */}
      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>PowerShell provisioning script</DialogTitle>
            <DialogDescription>
              Run in an elevated PowerShell session with Microsoft.Graph module installed.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
            {psScript}
          </pre>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => copy(psScript ?? "", "PowerShell script")}>
              <Copy className="h-4 w-4 mr-1.5" /> Copy
            </Button>
            <Button onClick={downloadScript}>
              <Download className="h-4 w-4 mr-1.5" /> Download .ps1
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
