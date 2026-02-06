import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Clock, 
  Users, 
  Link2, 
  Timer, 
  CheckCircle2, 
  AlertCircle,
  Video,
  ExternalLink 
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { MeetingContext } from "@/lib/addin/types";
import { useAddinLookups } from "@/hooks/useAddinLookups";
import { captureMeeting, createTimeDraft } from "@/lib/addin/meetingApi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MeetingPanelProps {
  meetingContext: MeetingContext;
  tenantId: number;
}

export function MeetingPanel({ meetingContext, tenantId }: MeetingPanelProps) {
  const { clients, packages, isLoading: lookupsLoading } = useAddinLookups(tenantId);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [createTimeDraftAfterLink, setCreateTimeDraftAfterLink] = useState(false);
  const [minutesOverride, setMinutesOverride] = useState<string>("");
  const [notes, setNotes] = useState("");
  
  const [isLinking, setIsLinking] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [linkResult, setLinkResult] = useState<{ success: boolean; deepLink?: string } | null>(null);
  const [draftResult, setDraftResult] = useState<{ success: boolean; deepLink?: string } | null>(null);

  // Calculate duration in minutes
  const startTime = new Date(meetingContext.startTime);
  const endTime = new Date(meetingContext.endTime);
  const durationMinutes = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

  // Filter packages by selected client
  const filteredPackages = selectedClientId
    ? packages.filter(p => p.client_id?.toString() === selectedClientId)
    : [];

  const handleLinkMeeting = async () => {
    setIsLinking(true);
    setLinkResult(null);

    try {
      const response = await captureMeeting({
        provider: 'microsoft',
        external_event_id: meetingContext.id,
        title: meetingContext.subject,
        starts_at: meetingContext.startTime,
        ends_at: meetingContext.endTime,
        organiser_email: meetingContext.organizer.email,
        teams_join_url: meetingContext.teamsJoinUrl,
        location: meetingContext.location,
        attendees_count: meetingContext.attendeesCount,
        link: selectedClientId ? {
          client_id: selectedClientId,
          package_id: selectedPackageId || null,
        } : undefined,
      });

      setLinkResult({
        success: true,
        deepLink: response.links.open_client_timeline || response.links.open_meetings,
      });

      toast.success("Meeting linked successfully");

      // Optionally create time draft
      if (createTimeDraftAfterLink) {
        await handleCreateTimeDraft();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link meeting";
      toast.error(message);
      setLinkResult({ success: false });
    } finally {
      setIsLinking(false);
    }
  };

  const handleCreateTimeDraft = async () => {
    setIsCreatingDraft(true);
    setDraftResult(null);

    try {
      const response = await createTimeDraft({
        external_event_id: meetingContext.id,
        client_id: selectedClientId || undefined,
        package_id: selectedPackageId || undefined,
        minutes_override: minutesOverride ? parseInt(minutesOverride, 10) : undefined,
        notes: notes || undefined,
      });

      setDraftResult({
        success: true,
        deepLink: response.links.open_time_inbox,
      });

      toast.success(`Time draft created: ${response.time_draft.minutes} minutes`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create time draft";
      toast.error(message);
      setDraftResult({ success: false });
    } finally {
      setIsCreatingDraft(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Meeting Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Meeting Details */}
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <h4 className="font-medium text-sm line-clamp-2">{meetingContext.subject}</h4>
          
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(startTime, "MMM d, h:mm a")} - {format(endTime, "h:mm a")}
            </span>
            <Badge variant="secondary" className="text-xs">
              <Timer className="h-3 w-3 mr-1" />
              {durationMinutes} min
            </Badge>
          </div>

          {meetingContext.attendeesCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {meetingContext.attendeesCount} attendee{meetingContext.attendeesCount !== 1 ? 's' : ''}
            </div>
          )}

          {meetingContext.teamsJoinUrl && (
            <Badge variant="outline" className="text-xs">
              <Video className="h-3 w-3 mr-1" />
              Teams Meeting
            </Badge>
          )}
        </div>

        {/* Link Form */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="client" className="text-sm">Link to Client</Label>
            <Select
              value={selectedClientId}
              onValueChange={(value) => {
                setSelectedClientId(value);
                setSelectedPackageId("");
              }}
              disabled={lookupsLoading}
            >
              <SelectTrigger id="client">
                <SelectValue placeholder="Select client..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No client</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClientId && filteredPackages.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="package" className="text-sm">Package (optional)</Label>
              <Select
                value={selectedPackageId}
                onValueChange={setSelectedPackageId}
              >
                <SelectTrigger id="package">
                  <SelectValue placeholder="Select package..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No package</SelectItem>
                  {filteredPackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id.toString()}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="createDraft"
              checked={createTimeDraftAfterLink}
              onCheckedChange={(checked) => setCreateTimeDraftAfterLink(checked === true)}
            />
            <Label htmlFor="createDraft" className="text-sm cursor-pointer">
              Also create time draft
            </Label>
          </div>

          {createTimeDraftAfterLink && (
            <div className="space-y-2 pl-6 border-l-2 border-muted">
              <div className="space-y-1">
                <Label htmlFor="minutes" className="text-xs">Minutes (default: {durationMinutes})</Label>
                <Input
                  id="minutes"
                  type="number"
                  placeholder={durationMinutes.toString()}
                  value={minutesOverride}
                  onChange={(e) => setMinutesOverride(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Optional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-16 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleLinkMeeting}
            disabled={isLinking || isCreatingDraft}
            className="w-full"
          >
            {isLinking ? (
              "Linking..."
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Link Meeting
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleCreateTimeDraft}
            disabled={isLinking || isCreatingDraft || !linkResult?.success}
            className="w-full"
          >
            {isCreatingDraft ? (
              "Creating..."
            ) : (
              <>
                <Timer className="h-4 w-4 mr-2" />
                Create Time Draft Only
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {linkResult && (
          <div className={`p-3 rounded-lg text-sm ${linkResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            {linkResult.success ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-foreground">Meeting linked</span>
                {linkResult.deepLink && (
                  <a 
                    href={linkResult.deepLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-auto text-primary hover:underline flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-foreground">Failed to link meeting</span>
              </div>
            )}
          </div>
        )}

        {draftResult && (
          <div className={`p-3 rounded-lg text-sm ${draftResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            {draftResult.success ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-foreground">Time draft created</span>
                {draftResult.deepLink && (
                  <a 
                    href={draftResult.deepLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-auto text-primary hover:underline flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-foreground">Failed to create time draft</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
