import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

export type DateRangeFilter = 'this_week' | 'this_quarter' | 'custom';
export type MeetingTypeFilter = 'all' | 'L10' | 'Quarterly' | 'Annual' | 'Same_Page';
export type SeatFilter = 'all' | 'my_seats' | 'uncovered';

interface LeadershipFiltersProps {
  dateRange: DateRangeFilter;
  onDateRangeChange: (value: DateRangeFilter) => void;
  meetingType: MeetingTypeFilter;
  onMeetingTypeChange: (value: MeetingTypeFilter) => void;
  seatFilter: SeatFilter;
  onSeatFilterChange: (value: SeatFilter) => void;
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  selectedYear: number;
  onYearChange: (value: number) => void;
  selectedQuarter: number;
  onQuarterChange: (value: number) => void;
}

export function LeadershipFilters({
  dateRange,
  onDateRangeChange,
  meetingType,
  onMeetingTypeChange,
  seatFilter,
  onSeatFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  selectedYear,
  onYearChange,
  selectedQuarter,
  onQuarterChange,
}: LeadershipFiltersProps) {
  const { data: teamUsers } = useVivacityTeamUsers();
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const quarters = [1, 2, 3, 4];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date Range */}
      <Select value={dateRange} onValueChange={(v) => onDateRangeChange(v as DateRangeFilter)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="this_quarter">This Quarter</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>

      {/* Quarter/Year selectors for custom */}
      {dateRange === 'custom' && (
        <>
          <Select value={selectedQuarter.toString()} onValueChange={(v) => onQuarterChange(parseInt(v))}>
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {quarters.map((q) => (
                <SelectItem key={q} value={q.toString()}>Q{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
            <SelectTrigger className="w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      <div className="h-6 w-px bg-border mx-1" />

      {/* Meeting Type */}
      <Select value={meetingType} onValueChange={(v) => onMeetingTypeChange(v as MeetingTypeFilter)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Meeting type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Meetings</SelectItem>
          <SelectItem value="L10">Level 10</SelectItem>
          <SelectItem value="Quarterly">Quarterly</SelectItem>
          <SelectItem value="Annual">Annual</SelectItem>
          <SelectItem value="Same_Page">Same Page</SelectItem>
        </SelectContent>
      </Select>

      {/* Seat Filter */}
      <Select value={seatFilter} onValueChange={(v) => onSeatFilterChange(v as SeatFilter)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Seats" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Seats</SelectItem>
          <SelectItem value="my_seats">My Seats</SelectItem>
          <SelectItem value="uncovered">Uncovered</SelectItem>
        </SelectContent>
      </Select>

      {/* Owner Filter */}
      <Select value={ownerFilter} onValueChange={onOwnerFilterChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All owners" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Owners</SelectItem>
          {teamUsers?.map((user) => (
            <SelectItem key={user.user_uuid} value={user.user_uuid}>
              {user.first_name} {user.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" onClick={() => {
        onDateRangeChange('this_week');
        onMeetingTypeChange('all');
        onSeatFilterChange('all');
        onOwnerFilterChange('all');
      }}>
        <Filter className="h-4 w-4 mr-1" />
        Reset
      </Button>
    </div>
  );
}
