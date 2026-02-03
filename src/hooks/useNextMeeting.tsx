import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addHours } from 'date-fns';
import type { NextMeetingData } from '@/components/eos/leadership/NextMeetingCard';

const VIVACITY_TENANT_ID = 6372;

/**
 * Fetches the next upcoming EOS meeting with quorum forecast
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

      // Fetch attendees for this meeting
      const { data: attendees, error: attendeesError } = await supabase
        .from('eos_meeting_attendees')
        .select('user_id, attendance_status, role_in_meeting')
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

      // Fetch seats to identify Integrator and Visionary
      const { data: seats, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          eos_role_type,
          accountability_seat_assignments!inner(user_id, assignment_type, end_date)
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .in('eos_role_type', ['visionary', 'integrator']);

      if (seatsError) {
        console.error('Error fetching seats:', seatsError);
      }

      const seatList = seats || [];
      
      // Find Integrator and Visionary user IDs
      let integratorUserId: string | null = null;
      let visionaryUserId: string | null = null;

      seatList.forEach((seat: any) => {
        const primaryAssignment = seat.accountability_seat_assignments?.find(
          (a: any) => a.assignment_type === 'Primary' && !a.end_date
        );
        if (primaryAssignment) {
          if (seat.eos_role_type === 'integrator') {
            integratorUserId = primaryAssignment.user_id;
          } else if (seat.eos_role_type === 'visionary') {
            visionaryUserId = primaryAssignment.user_id;
          }
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
      if (integratorUserId && !integratorPresent) {
        missingSeatRoles.push('Integrator');
      }
      if (visionaryUserId && !visionaryPresent) {
        missingSeatRoles.push('Visionary');
      }

      // Calculate quorum forecast
      // Quorum: 50%+ of expected + Integrator present for L10
      const attendanceRate = expectedAttendees > 0 
        ? confirmedAttendees / expectedAttendees 
        : 0;
      
      let quorumForecast: 'likely' | 'at_risk' | 'unlikely' = 'likely';
      
      if (meeting.meeting_type === 'L10') {
        if (attendanceRate < 0.5 || !integratorPresent) {
          quorumForecast = attendanceRate < 0.3 || (!integratorPresent && attendanceRate < 0.5) 
            ? 'unlikely' 
            : 'at_risk';
        }
      } else {
        // For Quarterly/Annual, more lenient
        if (attendanceRate < 0.4) {
          quorumForecast = attendanceRate < 0.25 ? 'unlikely' : 'at_risk';
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
        missingSeatRoles,
        integratorPresent,
        visionaryPresent,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });
}
