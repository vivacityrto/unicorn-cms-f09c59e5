import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Mail, Plus, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useOutlookConnectionStatus } from "@/hooks/useOutlookConnectionStatus";
import { useKpiEmailLog, type KpiEmailType } from "@/hooks/useKpiEmailLog";
import { OutlookInboxBrowser } from "@/components/email/OutlookInboxBrowser";

interface Props {
  subjectUuid: string;
}

interface PickedEmail {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  sentDateTime?: string;
}

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return iso ?? "—";
  }
}

function fmtMinutes(mins: number | null | undefined) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtSubject(s: string | null | undefined) {
  if (!s) return "—";
  return s.length > 50 ? s.slice(0, 50) + "…" : s;
}

function SlaBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return value ? (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Met</Badge>
  ) : (
    <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Missed</Badge>
  );
}

function typeLabel(t: KpiEmailType) {
  return t === "client_message" ? "Client message" : "General email";
}

export function KpiEmailLogSection({ subjectUuid }: Props) {
  const { connectionStatus, isLoading: connLoading, connect, isConnecting } =
    useOutlookConnectionStatus();
  // A row in oauth_tokens (surfaced via the user_outlook_connection_status view)
  // means the user has already linked Microsoft — same check the calendar uses.
  // Even an expired row counts: don't push them through OAuth again.
  const hasMicrosoftRow = !!connectionStatus;
  const { rows, isLoading, logManualPair, isSyncing } = useKpiEmailLog({
    userUuid: subjectUuid,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inbound, setInbound] = useState<PickedEmail | null>(null);
  const [outbound, setOutbound] = useState<PickedEmail | null>(null);
  const [emailType, setEmailType] = useState<KpiEmailType>("general_email");
  const [popupAuthUrl, setPopupAuthUrl] = useState<string | null>(null);

  const inboundRows = useMemo(
    () => rows.filter((r) => r.direction === "inbound"),
    [rows]
  );

  const resetSheet = () => {
    setStep(1);
    setInbound(null);
    setOutbound(null);
    setEmailType("general_email");
  };

  const handleConnect = async () => {
    try {
      // Tell the OAuth callback to bring the user back here after auth.
      localStorage.setItem("outlook_oauth_return_to", "/my/kpi");
      const result = await connect();
      if (result && "openedInNewTab" in result && !result.openedInNewTab && result.authUrl) {
        setPopupAuthUrl(result.authUrl);
      }
    } catch (err) {
      console.error("[KpiEmailLogSection] connect error", err);
    }
  };

  const handleConfirm = async () => {
    if (!inbound || !outbound) return;
    try {
      await logManualPair({
        inboundMessageId: inbound.id,
        outboundMessageId: outbound.id,
        emailType,
      });
      setSheetOpen(false);
      resetSheet();
    } catch {
      // toast handled in hook
    }
  };

  // ---------- State 1: not connected ----------
  if (!connLoading && !hasMicrosoftRow) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Connect your Outlook to start logging
          </CardTitle>
          <CardDescription>
            Once connected, log email response times from your inbox. One-time setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" /> Connect Outlook
              </>
            )}
          </Button>
          {popupAuthUrl && (
            <p className="mt-3 text-sm text-muted-foreground">
              Popup blocked.{" "}
              <a
                href={popupAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="underline text-primary"
              >
                Click here to open the Microsoft sign-in.
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---------- State 2: connected ----------
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email log
              </CardTitle>
              <CardDescription>
                Manually logged email responses with SLA tracking.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetSheet();
                setSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Log a response
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : inboundRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email responses logged yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Responded</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inboundRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmtDt(r.received_at)}</TableCell>
                    <TableCell title={r.subject ?? ""}>{fmtSubject(r.subject)}</TableCell>
                    <TableCell>{fmtDt(r.responded_at)}</TableCell>
                    <TableCell>{fmtMinutes(r.response_minutes)}</TableCell>
                    <TableCell>{typeLabel(r.email_type)}</TableCell>
                    <TableCell><SlaBadge value={r.sla_met} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) resetSheet();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Log a response</SheetTitle>
            <SheetDescription>
              Step {step} of 3 —{" "}
              {step === 1
                ? "select the received email"
                : step === 2
                ? "select your sent reply"
                : "confirm details"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {step === 1 && (
              <OutlookInboxBrowser
                folder="inbox"
                description="Select the email you received from your inbox"
                onSelectEmail={(e) => {
                  setInbound(e as PickedEmail);
                  setStep(2);
                }}
              />
            )}

            {step === 2 && (
              <>
                {inbound && (
                  <div className="p-3 rounded-md border bg-muted/30 text-sm">
                    <div className="font-medium">Received: {inbound.subject || "(No subject)"}</div>
                    <div className="text-muted-foreground">
                      From {inbound.from?.emailAddress?.address ?? "unknown"} ·{" "}
                      {fmtDt(inbound.receivedDateTime ?? null)}
                    </div>
                  </div>
                )}
                <OutlookInboxBrowser
                  folder="sent"
                  description="Select the reply you sent to this email"
                  recipientFilter={inbound?.from?.emailAddress?.address}
                  onSelectEmail={(e) => {
                    setOutbound(e as PickedEmail);
                    setStep(3);
                  }}
                />
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </>
            )}

            {step === 3 && inbound && outbound && (
              <div className="space-y-4">
                <div className="p-3 rounded-md border bg-muted/30 text-sm">
                  <div className="font-medium">Received</div>
                  <div>{inbound.subject || "(No subject)"}</div>
                  <div className="text-muted-foreground">
                    From {inbound.from?.emailAddress?.address ?? "unknown"} ·{" "}
                    {fmtDt(inbound.receivedDateTime ?? null)}
                  </div>
                </div>
                <div className="p-3 rounded-md border bg-muted/30 text-sm">
                  <div className="font-medium">Replied</div>
                  <div>{outbound.subject || "(No subject)"}</div>
                  <div className="text-muted-foreground">
                    Sent: {fmtDt(outbound.sentDateTime ?? null)}
                  </div>
                </div>

                {!outbound.sentDateTime && (
                  <div className="p-3 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900">
                    This email may not be a sent item — no sent timestamp found.
                    Go back and select from your Sent Items folder.
                  </div>
                )}

                <div>
                  <Label className="mb-2 block">Email type</Label>
                  <RadioGroup
                    value={emailType}
                    onValueChange={(v) => setEmailType(v as KpiEmailType)}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem id="kpi-email-general" value="general_email" />
                      <Label htmlFor="kpi-email-general" className="font-normal">
                        General email
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem id="kpi-email-client" value="client_message" />
                      <Label htmlFor="kpi-email-client" className="font-normal">
                        Client message
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleConfirm} disabled={isSyncing || !outbound.sentDateTime}>
                    {isSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Logging…
                      </>
                    ) : (
                      "Confirm"
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setStep(2)} disabled={isSyncing}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
