import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addHours } from 'date-fns';
import type { NextMeetingData } from '@/components/eos/leadership/NextMeetingCard';

const VIVACITY_TENANT_ID = 6372;

/**
 * Fetches the next upcoming EOS meeting with quorum forecast based on Accountability Chart seats.
 * 
 * Quorum calculation:
 * - Integrator must be present (L10 meetings)
 * - Visionary should be present (nice to have)
 * - >= 60% of required seats (is_required_for_quorum = true) must have owners present
 */
export function useNextMeeting() {
  return useQuery({
    queryKey: ['next-eos-meeting'],
    queryFn: async (): Promise<NextMeetingData | null> => {
      const now = new Date();
      
      // Fetch next upcoming meeting (not cancelled, not complete, scheduled in the future)
      const { data: meetings, error: meetingError } = await supabase
        .from('eos_meetings')
        .select(`
          id,
          meeting_type,
          scheduled_date,
          status,
          quorum_status
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .gte('scheduled_date', addHours(now, -2).toISOString()) // Include recently started meetings
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'completed')
        .not('status', 'eq', 'closed')
        .order('scheduled_date', { ascending: true })
        .limit(1);

      if (meetingError) {
        console.error('Error fetching next meeting:', meetingError);
        throw meetingError;
      }

      if (!meetings || meetings.length === 0) {
        return null;
      }

      const meeting = meetings[0];

      // Fetch attendees for this meeting with their seat_id
      const { data: attendees, error: attendeesError } = await supabase
        .from('eos_meeting_attendees')
        .select('user_id, attendance_status, role_in_meeting, seat_id')
        .eq('meeting_id', meeting.id);

      if (attendeesError) {
        console.error('Error fetching attendees:', attendeesError);
      }

      const attendeeList = attendees || [];
      const expectedAttendees = attendeeList.length;
      const confirmedAttendees = attendeeList.filter(a => 
        a.attendance_status === 'accepted' || 
        a.attendance_status === 'attended'
      ).length;

      // Fetch seats marked as required for quorum OR with Integrator/Visionary roles
      const { data: seats, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          eos_role_type,
          is_required_for_quorum,
          accountability_seat_assignments!inner(user_id, assignment_type, end_date)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .or('eos_role_type.in.(visionary,integrator),is_required_for_quorum.eq.true');

      if (seatsError) {
        console.error('Error fetching seats:', seatsError);
      }

      const seatList = seats || [];
      
      // Find Integrator and Visionary user IDs (from seat primary owners)
      let integratorUserId: string | null = null;
      let visionaryUserId: string | null = null;
      const quorumRequiredSeats: { seatId: string; seatName: string; userId: string | null }[] = [];

      seatList.forEach((seat: any) => {
        const primaryAssignment = seat.accountability_seat_assignments?.find(
          (a: any) => a.assignment_type === 'Primary' && !a.end_date
        );
        const userId = primaryAssignment?.user_id || null;
        
        if (seat.eos_role_type === 'integrator') {
          integratorUserId = userId;
        } else if (seat.eos_role_type === 'visionary') {
          visionaryUserId = userId;
        }
        
        // Track all quorum-required seats
        if (seat.is_required_for_quorum || seat.eos_role_type === 'integrator' || seat.eos_role_type === 'visionary') {
          quorumRequiredSeats.push({ 
            seatId: seat.id, 
            seatName: seat.seat_name,
            userId 
          });
        }
      });

      // Check if Integrator and Visionary are in attendee list and confirmed
      const integratorPresent = integratorUserId 
        ? attendeeList.some(a => a.user_id === integratorUserId && 
            ['accepted', 'attended'].includes(a.attendance_status || ''))
        : true; // If no integrator seat defined, consider it N/A

      const visionaryPresent = visionaryUserId
        ? attendeeList.some(a => a.user_id === visionaryUserId &&
            ['accepted', 'attended'].includes(a.attendance_status || ''))
        : true; // If no visionary seat defined, consider it N/A

      // Identify missing required seat roles
      const missingSeatRoles: string[] = [];
      quorumRequiredSeats.forEach(seat => {
        if (seat.userId) {
          const isPresent = attendeeList.some(a => 
            a.user_id === seat.userId && 
            ['accepted', 'attended'].includes(a.attendance_status || '')
          );
          if (!isPresent) {
            missingSeatRoles.push(seat.seatName);
          }
        } else {
          missingSeatRoles.push(`${seat.seatName} (unassigned)`);
        }
      });

      // Calculate quorum forecast based on seats
      // Quorum: 60%+ of required seats present + Integrator present for L10
      const requiredSeatsCount = quorumRequiredSeats.length;
      const presentRequiredSeats = quorumRequiredSeats.filter(seat => 
        seat.userId && attendeeList.some(a => 
          a.user_id === seat.userId && 
          ['accepted', 'attended'].includes(a.attendance_status || '')
        )
      ).length;
      
      const seatAttendanceRate = requiredSeatsCount > 0 
        ? presentRequiredSeats / requiredSeatsCount 
        : 1;
      
      let quorumForecast: 'likely' | 'at_risk' | 'unlikely' = 'likely';
      
      if (meeting.meeting_type === 'L10') {
        // L10 requires Integrator + 60% of required seats
        if (!integratorPresent || seatAttendanceRate < 0.6) {
          quorumForecast = (!integratorPresent && seatAttendanceRate < 0.4) 
            ? 'unlikely' 
            : 'at_risk';
        }
      } else {
        // For Quarterly/Annual, more lenient
        if (seatAttendanceRate < 0.5) {
          quorumForecast = seatAttendanceRate < 0.3 ? 'unlikely' : 'at_risk';
        }
      }

      return {
        id: meeting.id,
        meetingType: meeting.meeting_type as 'L10' | 'Quarterly' | 'Annual' | 'Same_Page',
        scheduledDate: meeting.scheduled_date,
        status: meeting.status || 'scheduled',
        expectedAttendees,
        confirmedAttendees,
        quorumForecast,
        missingSeatRoles: missingSeatRoles.slice(0, 5), // Limit to 5 for display
        integratorPresent,
        visionaryPresent,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });
}
