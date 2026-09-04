import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMeetingRealtime } from '@/hooks/useMeetingRealtime';
import { useEosMeetingSegments } from '@/hooks/useEosMeetingSegments';
import { useEosHeadlines } from '@/hooks/useEosHeadlines';
import { useEosSegueShares } from '@/hooks/useEosSegueShares';
import { useMeetingIssues } from '@/hooks/useMeetingIssues';
import { useMeetingTodos } from '@/hooks/useMeetingTodos';
import { useMeetingOutcomes } from '@/hooks/useMeetingOutcomes';
import { useOnePhraseCloses } from '@/hooks/useOnePhraseCloses';
import { useMeetingAttendance } from '@/hooks/useMeetingAttendance';
import { clientAvatarColor, clientInitials } from '@/lib/clientAvatarColor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Play, SkipForward, SkipBack, CheckCircle, Clock, Users, X, Target, 
  TrendingUp, AlertCircle, ListTodo, MessageSquare, Sparkles,
  ArrowRight, Timer, PlayCircle, Star, LogOut, Eye, Loader2, Pencil
} from 'lucide-react';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';
import { toast } from '@/hooks/use-toast';
import { useEosRocks, useEosScorecardMetrics } from '@/hooks/useEos';
import { useEosConfigurations } from '@/hooks/useEosConfigurations';
import { RockProgressControl } from '@/components/eos/RockProgressControl';
import { RockFormDialog } from '@/components/eos/RockFormDialog';
import { ClientBadge } from '@/components/eos/ClientBadge';
import { ScorecardEntryGrid } from '@/components/eos/ScorecardEntryGrid';
import { IssuesQueue } from '@/components/eos/IssuesQueue';
import { IDSDialog } from '@/components/eos/IDSDialog';
import { TodoInlineForm } from '@/components/eos/TodoInlineForm';
import { CreateIssueDialog } from '@/components/eos/CreateIssueDialog';
import { MeetingCloseValidationDialog } from '@/components/eos/MeetingCloseValidationDialog';
import { AttendancePanel } from '@/components/eos/AttendancePanel';
import { FacilitatorSelectDialog } from '@/components/eos/FacilitatorSelectDialog';
import { ChangeFacilitatorDialog } from '@/components/eos/ChangeFacilitatorDialog';
import { OnlineUsersIndicator } from '@/components/eos/OnlineUsersIndicator';
import { FacilitatorChecklist } from '@/components/eos/facilitator/FacilitatorChecklist';
import {
  RockReviewPrompt,
  IDSPrompt,
  ScorecardPrompt,
  MeetingRatingPrompt,
  OffTrackRockPrompt,
  IDSDecisionPrompt,
  QuorumWarningPrompt,
} from '@/components/eos/facilitator/FacilitatorPrompts';
import { RocksInsights } from '@/components/eos/facilitator/RocksInsights';
import type { EosMeetingSegment, MeetingType, ConfigMeetingType, EosIssue, EosRock, EosTodo } from '@/types/eos';

export const LiveMeetingView = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [newHeadline, setNewHeadline] = useState('');
  const [isGoodNews, setIsGoodNews] = useState(true);
  const [personalWin, setPersonalWin] = useState('');
  const [professionalWin, setProfessionalWin] = useState('');
  const [segueRating, setSegueRating] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<EosIssue | null>(null);
  const [idsDialogOpen, setIdsDialogOpen] = useState(false);
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [facilitatorDialogOpen, setFacilitatorDialogOpen] = useState(false);
  const [changeFacilitatorOpen, setChangeFacilitatorOpen] = useState(false);
  const [editingRock, setEditingRock] = useState<EosRock | null>(null);
  const [rockFormOpen, setRockFormOpen] = useState(false);
  const [segmentNotes, setSegmentNotes] = useState<Record<string, string>>({});
  const [myPhraseDraft, setMyPhraseDraft] = useState('');
  const isNavigatingRef = useRef(false);
  const [isNavigatingUI, setIsNavigatingUI] = useState(false);

  // Fetch meeting details first (needed for tenant_id)
  const { data: meeting, isLoading: meetingLoading } = useQuery({
    queryKey: ['eos-meeting', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meetings')
        .select('*')
        .eq('id', meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!meetingId,
  });

  // Use custom hooks
  const { segments, isLoading: segmentsLoading, isFetching: segmentsFetching, advanceSegment, goToPreviousSegment, updateSegmentNotes } = useEosMeetingSegments(meetingId);
  const { headlines, createHeadline, deleteHeadline } = useEosHeadlines(meetingId);
  const { segueShares, createSegueShare, deleteSegueShare } = useEosSegueShares(meetingId);
  const { issues } = useMeetingIssues(meetingId, meeting?.tenant_id);
  const { todos, createTodo, updateTodo } = useMeetingTodos(meetingId);
  const { ratings, saveRating, getUserRating } = useMeetingOutcomes(meetingId);
  const { closes: onePhraseCloses, saveOnePhraseClose, getUserPhrase } = useOnePhraseCloses(meetingId);
  const myExistingPhrase = profile?.user_uuid ? getUserPhrase(profile.user_uuid) : undefined;

  // Seed the draft input once from an already-saved phrase (e.g. rejoining
  // the meeting) without clobbering what the user is actively typing.
  useEffect(() => {
    if (myExistingPhrase && !myPhraseDraft) {
      setMyPhraseDraft(myExistingPhrase);
    }
    // Intentionally excludes `myPhraseDraft`: if the user deliberately clears the
    // field, `!myPhraseDraft` becomes true again, and adding it as a dep would
    // re-fire this effect and re-seed the just-cleared draft right back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myExistingPhrase]);
  const { rocks } = useEosRocks();
  const { metrics } = useEosScorecardMetrics();

  // Live-meeting Configuration for this tenant/type (Stage 1 config-driven
  // constants). Resolved from the same useEosConfigurations hook Stage 1 uses;
  // falls back to the prior hardcoded defaults if no Configuration is found
  // (e.g. flag-off / unconfigured type), so behavior never regresses.
  const { getConfigForType } = useEosConfigurations();
  const configuration = meeting?.meeting_type
    ? getConfigForType(meeting.meeting_type as ConfigMeetingType)
    : undefined;
  const scorecardCap = configuration?.scorecard_metric_cap ?? 5;
  const rocksScope = configuration?.rocks_scope ?? ['company', 'team'];

  // Fetch owner names for rocks
  const ownerIds = useMemo(() => {
    const ids = new Set<string>();
    rocks?.forEach(r => { if (r.owner_id) ids.add(r.owner_id); });
    return Array.from(ids);
  }, [rocks]);

  const { data: rockOwners } = useQuery({
    queryKey: ['rock-owners', ownerIds],
    queryFn: async () => {
      if (ownerIds.length === 0) return {};
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', ownerIds)
        .or('kpi_pod.is.null,kpi_pod.neq.qa');
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach(u => {
        map[u.user_uuid] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown';
      });
      return map;
    },
    enabled: ownerIds.length > 0,
  });

  // Fetch owner names for todos
  const todoOwnerIds = useMemo(() => {
    const ids = new Set<string>();
    todos?.forEach(t => { if (t.owner_id) ids.add(t.owner_id); });
    return Array.from(ids);
  }, [todos]);

  const { data: todoOwners } = useQuery({
    queryKey: ['todo-owners', todoOwnerIds],
    queryFn: async () => {
      if (todoOwnerIds.length === 0) return {};
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', todoOwnerIds)
        .or('kpi_pod.is.null,kpi_pod.neq.qa');
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach(u => {
        map[u.user_uuid] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown';
      });
      return map;
    },
    enabled: todoOwnerIds.length > 0,
  });

  // Fetch participants, then names separately - eos_meeting_participants.user_id
  // has a real FK to auth.users(id), not public.users, and there's no FK from
  // public.users to auth.users either, so no PostgREST embed hint can ever
  // resolve first_name/last_name in one request. This request was silently
  // failing (400) before too, but the pre-Stage-3 permission model
  // (isVivacityStaff || isFacilitator) never depended on `participants`
  // resolving correctly, so nobody noticed - now that control is
  // isFacilitator-only, a failed fetch here means canControlMeeting always
  // reads false regardless of who's actually the Leader in the database.
  const { data: participants } = useQuery({
    queryKey: ['eos-meeting-participants', meetingId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('eos_meeting_participants')
        .select('*')
        .eq('meeting_id', meetingId!);
      if (error) throw error;

      const userIds = (rows ?? []).map((p) => p.user_id);
      const { data: userRows, error: userError } = userIds.length
        ? await supabase
            .from('users')
            .select('user_uuid, first_name, last_name')
            .in('user_uuid', userIds)
        : { data: [], error: null };
      if (userError) throw userError;

      const userMap = new Map((userRows ?? []).map((u) => [u.user_uuid, u]));
      return (rows ?? []).map((p) => ({ ...p, users: userMap.get(p.user_id) ?? null }));
    },
    enabled: !!meetingId,
  });

  // Get user name for presence tracking
  const userName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  // Real-time sync with user identity
  const { onlineUsers, broadcastChange } = useMeetingRealtime({
    meetingId: meetingId!,
    userId: profile?.user_uuid,
    userName,
    avatarUrl: profile?.avatar_url || undefined,
    onSegmentChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
    },
    onHeadlineChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-headlines', meetingId] });
    },
    onTodoChange: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-todos', meetingId] });
    },
    onSegueChange: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-segue-shares', meetingId] });
    },
    onIssueChange: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-issues', meetingId] });
    },
    onOnePhraseCloseChange: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-one-phrase-closes', meetingId] });
    },
  });

  // Attendance hook for auto-attendance
  const { 
    attendees, 
    addGuestSilent, 
    updateAttendanceSilent 
  } = useMeetingAttendance(meetingId);

  // Track if we've already auto-added the user this session
  const hasAutoAttended = useRef(false);

  // Mirrors close_meeting_with_validation's own quorum formula (M6) so the
  // proactive in-meeting warning (QuorumWarningPrompt) agrees with what
  // would actually block closing, rather than a separately-invented check.
  const quorumMet = useMemo(() => {
    const total = attendees?.length ?? 0;
    if (total === 0) return true;
    const present = attendees?.filter(a =>
      a.attendance_status === 'attended' || a.attendance_status === 'late' || a.attendance_status === 'left_early'
    ).length ?? 0;
    return present >= Math.ceil(total * 0.5);
  }, [attendees]);

  // Computed segment states.
  // liveSegment = server state, facilitator-controlled - this is what's
  // officially running, unchanged from before this split.
  const liveSegment = useMemo(() =>
    segments?.find(s => s.started_at && !s.completed_at),
    [segments]
  );

  // viewingSegment = local/client-only, per-user, never written to the DB.
  // Defaults to following live (viewingSegmentId === null). Set by clicking
  // any segment in the sidebar - segment content is already loaded
  // client-side, so this never touches the network.
  const [viewingSegmentId, setViewingSegmentId] = useState<string | null>(null);
  const viewingSegment = useMemo(
    () => (viewingSegmentId ? segments?.find(s => s.id === viewingSegmentId) : liveSegment),
    [viewingSegmentId, segments, liveSegment],
  );
  const isViewingLive = viewingSegmentId === null || viewingSegmentId === liveSegment?.id;

  // Tracks the live segment as of the last moment this viewer was actually
  // following it, so the jump-to-live nudge can tell "the facilitator
  // advanced while I was browsing elsewhere" apart from "I just clicked to
  // browse away from an unchanged live position" - the latter isn't the
  // facilitator moving anywhere and shouldn't say so.
  const [lastSeenLiveSegmentId, setLastSeenLiveSegmentId] = useState<string | null>(null);
  useEffect(() => {
    if (isViewingLive) {
      setLastSeenLiveSegmentId(liveSegment?.id ?? null);
    }
  }, [isViewingLive, liveSegment?.id]);
  const facilitatorAdvancedWhileBrowsing =
    !isViewingLive && !!liveSegment && liveSegment.id !== lastSeenLiveSegmentId;

  const completedSegments = useMemo(() => 
    segments?.filter(s => s.completed_at) || [], 
    [segments]
  );
  
  const pendingSegments = useMemo(() => 
    segments?.filter(s => !s.started_at && !s.completed_at) || [], 
    [segments]
  );

  const meetingStarted = useMemo(() => 
    segments?.some(s => s.started_at), 
    [segments]
  );

  const allSegmentsComplete = useMemo(() => 
    segments?.length ? segments.every(s => s.completed_at) : false, 
    [segments]
  );

  // Auto-add current user as attendee when they join a live meeting
  useEffect(() => {
    if (!profile?.user_uuid || !meetingId || !meetingStarted || hasAutoAttended.current) return;
    
    const isAttendee = attendees?.some(a => a.user_id === profile.user_uuid);
    const isPresent = attendees?.some(
      a => a.user_id === profile.user_uuid && 
      (a.attendance_status === 'attended' || a.attendance_status === 'late')
    );
    
    // Auto-add and mark present
    if (!isAttendee) {
      hasAutoAttended.current = true;
      addGuestSilent.mutate({ userId: profile.user_uuid, notes: 'Auto-joined' });
    } else if (!isPresent) {
      hasAutoAttended.current = true;
      updateAttendanceSilent.mutate({ 
        userId: profile.user_uuid, 
        status: 'attended' 
      });
    }
  }, [profile?.user_uuid, attendees, meetingStarted, meetingId, addGuestSilent, updateAttendanceSilent]);

  // Hydrate segment notes from DB on load
  useEffect(() => {
    if (!segments) return;
    setSegmentNotes(prev => {
      const hydrated: Record<string, string> = { ...prev };
      segments.forEach(seg => {
        if (seg.notes && !(seg.id in hydrated)) {
          hydrated[seg.id] = seg.notes;
        }
      });
      return hydrated;
    });
  }, [segments]);

  // Save segment notes on blur
  const handleSegmentNoteBlur = (segmentId: string) => {
    const note = segmentNotes[segmentId];
    if (note !== undefined) {
      updateSegmentNotes.mutate({ segmentId, notes: note });
    }
  };

  // Share my one phrase close - broadcasts so other attendees see it land
  // without waiting on the still-unregistered postgres_changes path (see
  // useMeetingRealtime's broadcast-fallback comment).
  const handleShareMyPhrase = () => {
    const phrase = myPhraseDraft.trim();
    if (!phrase) return;
    saveOnePhraseClose.mutate(phrase, {
      onSuccess: (result) => {
        if (result.success) {
          setMyPhraseDraft('');
          broadcastChange('one_phrase_close_change');
        }
      },
    });
  };

  // Facilitator = current Leader, full stop. No zero-participants bootstrap
  // fallback: advance_segment/go_to_previous_segment (M6) have no such
  // allowance either, so a bootstrap "true" here would show a button that
  // errors on click. If no Leader is assigned yet, use Change Facilitator
  // to assign one — there is no scenario where nobody is facilitator.
  const isFacilitator = participants?.some(p => p.user_id === profile?.user_uuid && p.role === 'Leader') ?? false;

  // Derive facilitator display name from the participant row with role='Leader'.
  const facilitatorParticipant = participants?.find((p) => p.role === 'Leader');
  const facilitatorName = facilitatorParticipant
    ? `${facilitatorParticipant.users?.first_name || ''} ${facilitatorParticipant.users?.last_name || ''}`.trim() || null
    : null;

  // Any signed-in Vivacity staff member who is listed as a meeting attendee can start
  // the meeting — not just the designated facilitator, and not gated on the separate
  // eos_meeting_participants sync which can lag behind the attendee list users see.
  // Starting is a different tier from controlling: FacilitatorSelectDialog resolves/
  // confirms who the facilitator will be via change_meeting_facilitator (its own
  // Leader/Super-Admin/Integrator-or-above gate), independent of segment control.
  const isVivacityStaff = isVivacityStaffRole(profile?.unicorn_role);
  const isMeetingAttendee = attendees?.some(a => a.user_id === profile?.user_uuid) ?? false;
  const canStartMeeting = isVivacityStaff && isMeetingAttendee;
  // Segment control (advance/previous/close/IDS discuss-solve) is facilitator-only,
  // full stop — no super-admin or "any staff" bypass. Matches advance_segment/
  // go_to_previous_segment (M6), which removed that bypass at the RPC level;
  // keeping this looser here would show buttons that error on click for
  // non-facilitator staff. Use Change Facilitator (any time, incl. mid-meeting)
  // for the deliberate escape hatch instead of a blanket staff bypass.
  const canControlMeeting = isFacilitator;
  // Change Facilitator is the one deliberate escape hatch (plan: "current
  // Leader, super admin, or Integrator-or-above"), matching
  // change_meeting_facilitator's own is_integrator_or_above() role list
  // (Super Admin, Team Leader, Integrator) - broader than canControlMeeting
  // on purpose, since reassigning control is not the same as driving it.
  const canChangeFacilitator =
    canControlMeeting ||
    isSuperAdmin() ||
    profile?.unicorn_role === 'Team Leader' ||
    profile?.unicorn_role === 'Integrator';


  // Start first segment mutation
  const startFirstSegment = useMutation({
    mutationFn: async () => {
      if (!segments?.length) throw new Error('No segments available');
      const firstSegment = segments.find(s => !s.started_at);
      if (!firstSegment) throw new Error('No pending segments');
      
      const now = new Date().toISOString();
      
      // Start the first segment
      const { error } = await supabase
        .from('eos_meeting_segments')
        .update({ started_at: now })
        .eq('id', firstSegment.id);
      
      if (error) throw error;

      // Update meeting to in_progress with started_at timestamp.
      // Use .select() to verify the row was actually updated — RLS can silently
      // block the write and return { data: null, error: null }.
      const { data: updatedMeeting, error: meetingError } = await supabase
        .from('eos_meetings')
        .update({ 
          status: 'in_progress',
          started_at: now,
          is_complete: false 
        })
        .eq('id', meetingId)
        .select('id, status')
        .maybeSingle();

      if (meetingError) throw meetingError;
      if (!updatedMeeting || updatedMeeting.status !== 'in_progress') {
        throw new Error('Failed to start meeting — please try again or contact support.');
      }

      // Fire-and-forget: ensure all current Vivacity internal staff are
      // participants on L10 meetings. Do not block UI/navigation on this.
      if (meeting?.meeting_type === 'L10') {
        void supabase.rpc('sync_l10_meeting_participants', { p_meeting_id: meetingId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-meeting-segments', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meeting', meetingId] });
      toast({ title: 'Meeting started' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error starting meeting', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddHeadline = async () => {
    if (!newHeadline.trim()) return;
    await createHeadline.mutateAsync({
      meeting_id: meetingId!,
      headline: newHeadline,
      is_good_news: isGoodNews,
    });
    setNewHeadline('');
    broadcastChange('headline_change');
  };

  const handleAddSegueShare = async () => {
    if (!personalWin.trim() || !professionalWin.trim()) return;
    await createSegueShare.mutateAsync({
      meeting_id: meetingId!,
      personal_win: personalWin,
      professional_win: professionalWin,
      rating: segueRating ? Number(segueRating) : null,
    });
    setPersonalWin('');
    setProfessionalWin('');
    setSegueRating('');
    broadcastChange('segue_change');
  };

  const handleEndMeeting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_meeting_summary', {
        p_meeting_id: meetingId!,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Meeting ended', description: 'Summary generated successfully' });
      navigate(`/eos/meetings/${meetingId}/summary`);
    },
    onError: (error: Error) => {
      toast({ title: 'Error ending meeting', description: error.message, variant: 'destructive' });
    },
  });

  const handleSelectIssue = (issue: EosIssue) => {
    setSelectedIssue(issue);
    setIdsDialogOpen(true);
  };

  // Throttled segment navigation handlers to prevent double-clicks.
  // Own action always snaps the acting facilitator's view back to live
  // (no nudge needed for your own click) - other attendees who've browsed
  // away keep their local viewingSegmentId and see the jump-to-live nudge
  // instead, since realtime only invalidates the segments query, it never
  // touches viewingSegmentId.
  const handleAdvanceSegment = async () => {
    if (isNavigatingRef.current || segmentsFetching) return;
    isNavigatingRef.current = true;
    setIsNavigatingUI(true);
    try {
      await advanceSegment.mutateAsync();
      setViewingSegmentId(null);
      broadcastChange('segment_change');
    } finally {
      setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigatingUI(false);
      }, 1000);
    }
  };

  const handlePreviousSegment = async () => {
    if (isNavigatingRef.current || segmentsFetching) return;
    isNavigatingRef.current = true;
    setIsNavigatingUI(true);
    try {
      await goToPreviousSegment.mutateAsync();
      setViewingSegmentId(null);
      broadcastChange('segment_change');
    } finally {
      setTimeout(() => {
        isNavigatingRef.current = false;
        setIsNavigatingUI(false);
      }, 1000);
    }
  };


  const handleToggleTodo = async (todo: EosTodo) => {
    const newStatus = todo.status === 'Complete' ? 'Open' : 'Complete';
    await updateTodo.mutateAsync({
      id: todo.id,
      status: newStatus,
      completed_at: newStatus === 'Complete' ? new Date().toISOString() : null
    });
    broadcastChange('todo_change');
  };

  // Render segment content based on type — segment_type is a real stored
  // column (M9), always meaningfully derived at write time (from the
  // Configuration directly, or via keyword-match for the one remaining
  // legacy creation path - see M12) rather than re-derived here. A
  // frontend fallback (tried in an earlier review round, reverted) can't
  // tell "never classified" apart from a Configuration author
  // deliberately picking "General" as a real segment type, so guessing
  // client-side is wrong - fixed at the source instead.
  const renderSegmentContent = (segment: EosMeetingSegment) => {
    const type = segment.segment_type;

    switch (type) {
      case 'segue':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Personal & Professional Check-in ({segueShares?.length || 0})
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Share one personal and one professional best from the week. Rate the week 1-10.
            </p>

            {/* Add new share */}
            <div className="space-y-2 mb-4">
              <Input
                placeholder="Personal win..."
                value={personalWin}
                onChange={(e) => setPersonalWin(e.target.value)}
              />
              <Input
                placeholder="Professional win..."
                value={professionalWin}
                onChange={(e) => setProfessionalWin(e.target.value)}
              />
              <div className="flex gap-2">
                <Select value={segueRating} onValueChange={setSegueRating}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Rating 1-10" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddSegueShare}
                  disabled={!personalWin.trim() || !professionalWin.trim() || createSegueShare.isPending}
                  size="sm"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Shares list */}
            <div className="space-y-2">
              {segueShares?.map((share) => (
                <div
                  key={share.id}
                  className="flex items-start gap-2 p-3 rounded bg-muted/50"
                >
                  <div className="flex-1 text-sm space-y-1">
                    <p className="font-medium">
                      {share.users ? `${share.users.first_name || ''} ${share.users.last_name || ''}`.trim() || 'Unknown' : 'Unknown'}
                    </p>
                    <p><span className="font-medium">Personal:</span> {share.personal_win}</p>
                    <p><span className="font-medium">Professional:</span> {share.professional_win}</p>
                  </div>
                  {share.rating != null && (
                    <Badge variant="secondary" className="shrink-0">
                      {share.rating}/10
                    </Badge>
                  )}
                  {share.user_id === profile?.user_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSegueShare.mutate(share.id, {
                        onSuccess: () => broadcastChange('segue_change'),
                      })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {(!segueShares || segueShares.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No shares yet. Add the first one!
                </p>
              )}
            </div>
          </Card>
        );

      case 'scorecard':
        return (
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Scorecard Review
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Review weekly metrics. Flag any numbers off track.
              </p>
              <ScorecardPrompt />
            </Card>
            {metrics?.slice(0, scorecardCap).map((metric) => (
              <ScorecardEntryGrid key={metric.id} metric={metric} />
            ))}
            {(!metrics || metrics.length === 0) && (
              <Card className="p-6">
                <p className="text-muted-foreground text-sm text-center">
                  No scorecard metrics configured. Add metrics in the Scorecard section.
                </p>
              </Card>
            )}
          </div>
        );

      case 'rocks': {
        const now = new Date();
        const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
        const currentYear = now.getFullYear();
        
        // Filter to current quarter, scoped by the Configuration's rocks_scope
        // (defaults to Company + Team; empty array = show all levels), exclude
        // completed, sort by owner name.
        const currentQuarterRocks = rocks
          ?.filter(r =>
            r.quarter_year === currentYear &&
            r.quarter_number === currentQuarter &&
            r.status !== 'complete' &&
            (rocksScope.length === 0 || rocksScope.includes(r.rock_level ?? ''))
          )
          .sort((a, b) => {
            const nameA = rockOwners?.[a.owner_id || ''] || '';
            const nameB = rockOwners?.[b.owner_id || ''] || '';
            return nameA.localeCompare(nameB);
          }) || [];

        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Rock Review
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Quick status update only - On Track or Off Track. No discussion.
            </p>
            <div className="space-y-3 mb-4">
              <RockReviewPrompt />
              {/* Same rocks_scope-filtered set as the list below, not the raw
                  rocks array - otherwise insights (overdue/off-track counts)
                  can reference rocks the segment itself isn't even showing. */}
              <RocksInsights rocks={currentQuarterRocks.map(r => ({ ...r, owner_user_id: r.owner_id }))} />
            </div>
            <div className="space-y-3">
              {currentQuarterRocks.map((rock) => (
                <Card key={rock.id} className="p-4 bg-muted/20">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-medium">{rock.title}</p>
                          <ClientBadge clientId={rock.client_tenant_id} />
                          <Badge variant="outline" className={`text-xs ${
                            rock.rock_level === 'company'
                              ? 'border-primary/40 text-primary'
                              : 'border-accent-foreground/30 text-accent-foreground'
                          }`}>
                            {/* rocks_scope is now editable and can include 'individual'
                                (round 1 fix) - show the real level instead of assuming
                                every non-company rock is Team. */}
                            {rock.rock_level === 'company'
                              ? 'Company'
                              : rock.rock_level === 'individual'
                                ? 'Individual'
                                : 'Team'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Q{rock.quarter_number} {rock.quarter_year}
                          </Badge>
                        </div>
                        {rock.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{rock.description}</p>
                        )}
                      </div>
                    </div>
                    {rock.status === 'off_track' && <OffTrackRockPrompt rockTitle={rock.title} />}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {rock.owner_id && rockOwners?.[rock.owner_id] && (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="w-5 h-5">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {rockOwners[rock.owner_id]
                                  .split(' ')
                                  .map((n: string) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{rockOwners[rock.owner_id]}</span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Due: {rock.due_date ? format(new Date(rock.due_date), 'dd/MM/yyyy') : 'Not set'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RockProgressControl rock={rock} compact />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingRock(rock); setRockFormOpen(true); }}
                          aria-label="Edit rock"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {currentQuarterRocks.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No active rocks for Q{currentQuarter} {currentYear}
                </p>
              )}
            </div>
          </Card>
        );
      }

      case 'headlines':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Headlines ({headlines?.length || 0})
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Share good news and FYIs. Customer/Employee Headlines.
            </p>
            
            {/* Add new headline */}
            <div className="space-y-2 mb-4">
              <Input
                placeholder="Share a headline..."
                value={newHeadline}
                onChange={(e) => setNewHeadline(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHeadline()}
              />
              <div className="flex gap-2">
                <Button
                  variant={isGoodNews ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGoodNews(true)}
                >
                  Good News
                </Button>
                <Button
                  variant={!isGoodNews ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGoodNews(false)}
                >
                  FYI
                </Button>
                <Button
                  onClick={handleAddHeadline}
                  disabled={!newHeadline.trim() || createHeadline.isPending}
                  size="sm"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Headlines list */}
            <div className="space-y-2">
              {headlines?.map((headline) => (
                <div
                  key={headline.id}
                  className="flex items-start gap-2 p-3 rounded bg-muted/50"
                >
                  <Badge variant={headline.is_good_news ? 'default' : 'secondary'} className="shrink-0">
                    {headline.is_good_news ? '✓ Good' : 'FYI'}
                  </Badge>
                  <p className="flex-1 text-sm">{headline.headline}</p>
                  {headline.user_id === profile?.user_uuid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteHeadline.mutate(headline.id, {
                        onSuccess: () => broadcastChange('headline_change'),
                      })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {(!headlines || headlines.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No headlines yet. Add the first one!
                </p>
              )}
            </div>
          </Card>
        );

      case 'todos':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              To-Do List ({todos?.length || 0})
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Review last week's to-dos. Did you do it? Yes or No.
            </p>
            
            <div className="space-y-2 mb-4">
              {todos?.map((todo) => (
                <div 
                  key={todo.id} 
                  className={`p-3 rounded flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    todo.status === 'Complete' 
                      ? 'bg-green-500/10 border border-green-500/20' 
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => handleToggleTodo(todo)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      todo.status === 'Complete' 
                        ? 'bg-green-500 border-green-500' 
                        : 'border-muted-foreground'
                    }`}>
                      {todo.status === 'Complete' && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium text-sm ${todo.status === 'Complete' ? 'line-through opacity-70' : ''}`}>
                        {todo.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due: {todo.due_date ? format(new Date(todo.due_date), 'dd/MM/yyyy') : 'Not set'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Assigned to: {todo.owner_id ? (todoOwners?.[todo.owner_id] ?? 'Unassigned') : 'Unassigned'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={todo.status === 'Complete' ? 'default' : 'secondary'}>
                    {todo.status === 'Complete' ? 'Done' : 'Open'}
                  </Badge>
                </div>
              ))}
              {(!todos || todos.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No to-dos from last week
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Add new To-Do:</p>
              <TodoInlineForm
                meetingId={meetingId!}
                onTodoCreated={async (todo) => {
                  await createTodo.mutateAsync(todo);
                  broadcastChange('todo_change');
                }}
              />
            </div>
          </Card>
        );

      case 'ids':
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              IDS - Identify, Discuss, Solve
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Work through issues one at a time. Identify the real issue, Discuss, then Solve.
            </p>
            <div className="space-y-3 mb-4">
              <IDSPrompt />
              <IDSDecisionPrompt />
            </div>
            <IssuesQueue
              issues={issues || []}
              onSelectIssue={handleSelectIssue}
              onCreateIssue={() => setCreateIssueOpen(true)}
              isFacilitator={isFacilitator}
              currentMeetingId={meetingId}
            />
          </Card>
        );

      case 'conclude': {
        // Rating input lives here, not only behind the post-advance
        // "All Segments Complete" summary - close_meeting_with_validation
        // (M6) hard-gates on >=50% of present attendees having rated, and
        // the close dialog itself is read-only, so this is the only place
        // most attendees will ever see a rating control before a facilitator
        // tries to close and hits "Can't Close Yet" with no obvious path
        // to actually submit one.
        const myRating = profile?.user_uuid ? getUserRating(profile.user_uuid) : undefined;
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Conclude / One Phrase Close
            </h3>
            <div className="space-y-4">
              <MeetingRatingPrompt />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">Rate this meeting (1-10):</p>
                  <span className="flex items-center gap-1.5 text-xs font-semibold bg-muted rounded-full px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {ratings?.length ?? 0} of {attendees?.length ?? 0} rated
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <Button
                      key={n}
                      variant={myRating === n ? 'default' : 'outline'}
                      size="sm"
                      className="w-9 h-9"
                      onClick={() => saveRating.mutate(n)}
                      disabled={saveRating.isPending}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                {myRating && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Your rating: <span className="font-medium">{myRating}/10</span>
                  </p>
                )}
              </div>
              {!quorumMet && <QuorumWarningPrompt />}
              <div>
                <p className="font-medium text-sm mb-2">Recap To-Dos Created:</p>
                <div className="space-y-1">
                  {todos?.filter(t => t.status !== 'Complete').slice(0, 5).map((todo) => (
                    <div key={todo.id} className="text-sm text-muted-foreground flex items-center gap-2">
                      <ArrowRight className="h-3 w-3" />
                      {todo.title}
                    </div>
                  ))}
                  {(!todos || todos.filter(t => t.status !== 'Complete').length === 0) && (
                    <p className="text-sm text-muted-foreground">No open to-dos</p>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-sm">One Phrase Close:</p>
                  <span className="flex items-center gap-1.5 text-xs font-semibold bg-muted rounded-full px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {onePhraseCloses?.length ?? 0} of {attendees?.length ?? 0} shared
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6 items-end">
                  {attendees?.map((attendee) => {
                    const name = attendee.users
                      ? `${attendee.users.first_name || ''} ${attendee.users.last_name || ''}`.trim() || 'Unknown'
                      : 'Unknown';
                    const phrase = getUserPhrase(attendee.user_id);
                    const isOnline = onlineUsers.some((u) => u.user_id === attendee.user_id);
                    const color = clientAvatarColor(attendee.user_id);
                    return (
                      <div key={attendee.user_id} className="flex flex-col items-center gap-2">
                        {phrase ? (
                          <div className="relative w-full rounded-2xl bg-primary/10 px-3 py-2.5 shadow-sm animate-in fade-in-0 zoom-in-90 duration-300">
                            <p className="text-sm font-medium text-foreground text-center break-words">&ldquo;{phrase}&rdquo;</p>
                            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 rotate-45 h-3 w-3 bg-primary/10" />
                          </div>
                        ) : isOnline ? (
                          <div className="relative w-full rounded-2xl bg-muted px-3 py-3.5 flex items-center justify-center">
                            <span className="flex gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                            </span>
                            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 rotate-45 h-3 w-3 bg-muted" />
                          </div>
                        ) : (
                          <div className="w-full rounded-2xl border border-dashed border-border px-3 py-3.5 flex items-center justify-center">
                            <p className="text-xs italic text-muted-foreground">waiting to join&hellip;</p>
                          </div>
                        )}
                        <div className="relative">
                          <Avatar className="h-11 w-11 border-2 border-background">
                            {attendee.users?.avatar_url && (
                              <AvatarImage src={attendee.users.avatar_url} alt={name} />
                            )}
                            <AvatarFallback className={`${color.solid} text-xs font-bold`}>
                              {clientInitials(name)}
                            </AvatarFallback>
                          </Avatar>
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                          )}
                        </div>
                        <span className="text-xs font-medium text-center truncate w-full">{name}</span>
                      </div>
                    );
                  })}
                  {(!attendees || attendees.length === 0) && (
                    <p className="text-sm text-muted-foreground">No attendees yet</p>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={userName} />}
                    <AvatarFallback className={`${clientAvatarColor(profile?.user_uuid).solid} text-xs font-bold`}>
                      {clientInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                  <Input
                    placeholder="Your one phrase close&hellip;"
                    value={myPhraseDraft}
                    onChange={(e) => setMyPhraseDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleShareMyPhrase();
                    }}
                    maxLength={140}
                    className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <Button
                    size="sm"
                    className="rounded-full flex-shrink-0"
                    onClick={handleShareMyPhrase}
                    disabled={saveOnePhraseClose.isPending || !myPhraseDraft.trim()}
                  >
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      }

      default:
        return (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{segment.segment_name}</h3>
            <Textarea 
              placeholder="Notes for this segment..."
              value={segmentNotes[segment.id] || ''}
              onChange={(e) => setSegmentNotes(prev => ({ ...prev, [segment.id]: e.target.value }))}
              onBlur={() => handleSegmentNoteBlur(segment.id)}
              rows={4}
            />
          </Card>
        );
    }
  };

  // Loading state
  if (meetingLoading || segmentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading meeting...</p>
        </div>
      </div>
    );
  }

  // No meeting found
  if (!meeting) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-bold mb-2">Meeting Not Found</h2>
          <p className="text-muted-foreground mb-4">This meeting doesn't exist or you don't have access.</p>
          <Button onClick={() => navigate('/eos/meetings')}>Back to Meetings</Button>
        </div>
      </div>
    );
  }

  // No segments - prompt to add them
  if (!segments || segments.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-warning" />
          <h2 className="text-xl font-bold mb-2">No Agenda Loaded</h2>
          <p className="text-muted-foreground mb-4">
            This meeting doesn't have an agenda. The EOS agenda segments need to be configured.
          </p>
          <Button onClick={() => navigate('/eos/meetings')}>Back to Meetings</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Leave/Back button - always visible */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/eos/meetings')}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Leave Meeting
            </Button>
            <div className="border-l pl-4">
              <h1 className="text-2xl font-bold">{meeting.title}</h1>
              <p className="text-muted-foreground text-sm">
                {format(new Date(meeting.scheduled_date), 'dd/MM/yyyy h:mm a')} • {meeting.meeting_type} Meeting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {facilitatorName && (
              <div className="hidden md:flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Facilitator:</span>
                <span>{facilitatorName}</span>
              </div>
            )}
            {meeting?.status === 'in_progress' && canChangeFacilitator && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChangeFacilitatorOpen(true)}
              >
                Change Facilitator
              </Button>
            )}
            {segmentsFetching && (
              <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing...
              </span>
            )}
            <OnlineUsersIndicator onlineUsers={onlineUsers} attendees={attendees} />

            
            {!meetingStarted && canStartMeeting && (
              <Button 
                onClick={() => setFacilitatorDialogOpen(true)} 
                size="sm"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Start Meeting
              </Button>
            )}
            
            {meetingStarted && canControlMeeting && completedSegments.length > 0 && (
              <Button 
                onClick={handlePreviousSegment} 
                size="sm" 
                variant="outline"
                disabled={isNavigatingUI || goToPreviousSegment.isPending || segmentsFetching}
              >
                {(isNavigatingUI || goToPreviousSegment.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <SkipBack className="h-4 w-4 mr-2" />
                )}
                Previous
              </Button>
            )}
            
            {meetingStarted && canControlMeeting && liveSegment && (
              <Button 
                onClick={handleAdvanceSegment} 
                size="sm" 
                variant="outline"
                disabled={isNavigatingUI || advanceSegment.isPending || segmentsFetching}
              >
                {(isNavigatingUI || advanceSegment.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <SkipForward className="h-4 w-4 mr-2" />
                )}
                Next Segment
              </Button>
            )}
            
            {meetingStarted && canControlMeeting && (
              <Button
                onClick={() => setCloseDialogOpen(true)}
                size="sm"
                variant={allSegmentsComplete ? 'default' : 'outline'}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                End Meeting
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agenda Sidebar */}
        <div className="w-96 border-r bg-muted/20 overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-4">
            {/* Attendance Panel */}
            <AttendancePanel 
              meetingId={meetingId!} 
              meetingType={meeting?.meeting_type || 'L10'}
              meetingStatus={meeting?.status || 'scheduled'}
              isLive={meetingStarted}
              canEdit={isFacilitator}
              onlineUsers={onlineUsers}
              participants={participants?.map(p => ({ user_id: p.user_id, role: p.role })) || []}
            />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Agenda</h2>
              <Badge variant="outline" className="text-xs">
                {completedSegments.length}/{segments.length}
              </Badge>
            </div>
            
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(completedSegments.length / segments.length) * 100}%` }}
              />
            </div>

            <div className="space-y-2">
              {segments.map((segment, idx) => {
                const isLive = segment.id === liveSegment?.id;
                const isBeingViewed = segment.id === viewingSegment?.id;
                const isComplete = !!segment.completed_at;

                return (
                  <Card
                    key={segment.id}
                    onClick={() => setViewingSegmentId(segment.id)}
                    className={`p-3 transition-all cursor-pointer ${
                      isLive
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : isBeingViewed
                        ? 'ring-2 ring-primary/50'
                        : isComplete
                        ? 'bg-muted/50 opacity-75 hover:opacity-100'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5 ${
                        isComplete ? 'bg-primary text-primary-foreground' :
                        isLive ? 'bg-primary-foreground text-primary' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {isComplete ? <CheckCircle className="h-3 w-3" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${isComplete ? 'line-through' : ''}`}>
                          {segment.segment_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs opacity-80">
                          <Timer className="h-3 w-3" />
                          {segment.duration_minutes} min
                        </div>
                      </div>
                      {isLive && (
                        <Badge variant="secondary" className="shrink-0 text-xs bg-primary-foreground text-primary">
                          Now
                        </Badge>
                      )}
                      {!isLive && isBeingViewed && (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          Viewing
                        </Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Not started state - viewing mode */}
            {!meetingStarted && (
              <div className="space-y-6">
                <Card className="p-8 text-center">
                  <Eye className="h-16 w-16 mx-auto mb-4 text-primary" />
                  <h2 className="text-xl font-bold mb-2">Meeting Preview</h2>
                  <p className="text-muted-foreground mb-2">
                    This {meeting.meeting_type} meeting has {segments.length} agenda segments 
                    ({segments.reduce((sum, s) => sum + s.duration_minutes, 0)} minutes total).
                  </p>
                  <p className="text-sm mb-6">
                    <span className="text-muted-foreground">Facilitator: </span>
                    <span className="font-medium">
                      {facilitatorName ?? 'Not assigned'}
                    </span>
                  </p>
                  {canStartMeeting ? (
                    <Button 
                      size="lg"
                      onClick={() => setFacilitatorDialogOpen(true)}
                    >
                      <Play className="h-5 w-5 mr-2" />
                      Start Meeting
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {isVivacityStaff
                        ? "You're not listed as an attendee on this meeting, so you can't start it. Ask someone on the attendee list to start."
                        : 'Waiting for a Vivacity staff attendee to start the meeting…'}
                    </p>
                  )}
                </Card>
                
                {/* Preview of agenda segments */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-primary" />
                    Agenda Overview
                  </h3>
                  <div className="space-y-3">
                    {segments.map((segment, idx) => (
                      <div key={segment.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{segment.segment_name}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {segment.duration_minutes} min
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Jump-to-live nudge - shown only when the facilitator has
                genuinely advanced while this viewer was browsing elsewhere,
                not merely because the viewer clicked away from an unchanged
                live segment (never for the facilitator's own action either,
                which snaps their view immediately in the handlers above). */}
            {facilitatorAdvancedWhileBrowsing && (
              <Card className="p-3 flex items-center justify-between gap-3 border-primary/30 bg-primary/5">
                <p className="text-sm">
                  Facilitator moved to <span className="font-medium">{liveSegment.segment_name}</span>
                </p>
                <Button size="sm" variant="outline" onClick={() => setViewingSegmentId(null)}>
                  Jump to live
                </Button>
              </Card>
            )}

            {/* Segment Header - shows whichever segment this viewer is looking
                at, which defaults to (and for the facilitator, always is) live. */}
            {viewingSegment && (
              <Card className="p-6 bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline" className="mb-2">
                      {isViewingLive ? 'Current Segment' : 'Viewing'}
                    </Badge>
                    <h2 className="text-2xl font-bold">{viewingSegment.segment_name}</h2>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-lg font-mono">{viewingSegment.duration_minutes}:00</span>
                    </div>
                    <p className="text-xs text-muted-foreground">minutes allocated</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Current Segment Content */}
            {viewingSegment && renderSegmentContent(viewingSegment)}

            {/* All segments complete */}
            {allSegmentsComplete && (
              <>
                <Card className="p-8 text-center bg-primary/5 border-primary/20">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
                  <h2 className="text-xl font-bold mb-2">All Segments Complete!</h2>
                  <p className="text-muted-foreground mb-6">
                    Great meeting! Click "End Meeting" to complete the meeting close checklist.
                  </p>
                  {isFacilitator && (
                    <Button
                      size="lg"
                      onClick={() => setCloseDialogOpen(true)}
                    >
                      <CheckCircle className="h-5 w-5 mr-2" />
                      End Meeting & Complete Checklist
                    </Button>
                  )}
                </Card>

                {/* Per-attendee meeting rating (visible to everyone, not just facilitator) */}
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      Rate this meeting (1-10)
                    </h3>
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-muted rounded-full px-3 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {ratings?.length ?? 0} of {attendees?.length ?? 0} rated
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Every attendee is encouraged to rate the meeting.
                  </p>
                  {(() => {
                    const myRating = profile?.user_uuid ? getUserRating(profile.user_uuid) : undefined;
                    return (
                      <>
                        <div className="flex gap-1 flex-wrap">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <Button
                              key={n}
                              variant={myRating === n ? 'default' : 'outline'}
                              size="sm"
                              className="w-9 h-9"
                              onClick={() => saveRating.mutate(n)}
                              disabled={saveRating.isPending}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                        {myRating && (
                          <p className="text-sm text-muted-foreground mt-3">
                            Your rating: <span className="font-medium">{myRating}/10</span>
                          </p>
                        )}
                      </>
                    );
                  })()}
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Right: Issues Panel + Facilitator Checklist */}
        <div className="w-80 border-l bg-card overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-4">
            {/* Facilitator Checklist - only visible in facilitator mode */}
            <FacilitatorChecklist
              meetingType={(meeting?.meeting_type as MeetingType) || 'L10'}
              segments={segments}
              currentSegmentId={liveSegment?.id}
              attendeesCount={attendees?.length || 0}
              quorumMet={quorumMet}
              meetingStartTime={meeting?.started_at}
            />
            
            <IssuesQueue
              issues={issues || []}
              onSelectIssue={handleSelectIssue}
              onCreateIssue={() => setCreateIssueOpen(true)}
              isFacilitator={isFacilitator}
              currentMeetingId={meetingId}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <IDSDialog
        open={idsDialogOpen}
        onOpenChange={setIdsDialogOpen}
        issue={selectedIssue}
        isFacilitator={isFacilitator}
        meetingId={meetingId}
        onIssueChanged={() => broadcastChange('issue_change')}
      />

      <CreateIssueDialog
        open={createIssueOpen}
        onOpenChange={setCreateIssueOpen}
        onCreated={() => broadcastChange('issue_change')}
        meetingId={meetingId}
        meetingSegmentId={liveSegment?.id}
        context="meeting_ids"
      />

      <MeetingCloseValidationDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        meetingId={meetingId!}
        meetingType={(meeting?.meeting_type as MeetingType) || 'L10'}
        todosCount={todos?.length || 0}
        issuesDiscussed={issues?.filter(i => i.status === 'Solved' || i.status === 'Discussing' || i.status === 'Closed').length || 0}
      />

      <FacilitatorSelectDialog
        open={facilitatorDialogOpen}
        onOpenChange={setFacilitatorDialogOpen}
        meetingId={meetingId!}
        onStartMeeting={() => startFirstSegment.mutate()}
        isStarting={startFirstSegment.isPending}
      />

      <ChangeFacilitatorDialog
        open={changeFacilitatorOpen}
        onOpenChange={setChangeFacilitatorOpen}
        meetingId={meetingId!}
      />

      <RockFormDialog
        open={rockFormOpen}
        onOpenChange={(open) => { setRockFormOpen(open); if (!open) setEditingRock(null); }}
        rock={editingRock}
      />
    </div>
  );
};
