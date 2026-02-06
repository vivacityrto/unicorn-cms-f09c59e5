/**
 * Package Lifecycle Tests
 * 
 * Tests for package workflow logic:
 * - Package creation and configuration
 * - Stage progression and dependencies
 * - Hour tracking and usage calculations
 * - Alert thresholds
 */
import { describe, it, expect } from 'vitest';
import {
  mockPackages,
  mockPackageInstances,
  mockStages,
  mockStageInstances,
  mockTimeEntries,
  mockAlerts,
  calculatePackageUsage,
} from '../fixtures/package-test-data';

describe('Package Configuration', () => {
  describe('Package Status', () => {
    it('active packages are available for assignment', () => {
      expect(mockPackages.kickStart.status).toBe('active');
      expect(mockPackages.healthCheck.status).toBe('active');
      expect(mockPackages.membership.status).toBe('active');
    });

    it('inactive packages should not be assigned', () => {
      expect(mockPackages.inactivePackage.status).toBe('inactive');
    });
  });

  describe('Package Types', () => {
    it('packages have valid package types', () => {
      const validTypes = ['kickstart', 'healthcheck', 'membership', 'course_build', 'custom'];
      expect(validTypes).toContain(mockPackages.kickStart.package_type);
      expect(validTypes).toContain(mockPackages.healthCheck.package_type);
      expect(validTypes).toContain(mockPackages.membership.package_type);
    });

    it('packages have total hours configured', () => {
      expect(mockPackages.kickStart.total_hours).toBeGreaterThan(0);
      expect(mockPackages.healthCheck.total_hours).toBeGreaterThan(0);
      expect(mockPackages.membership.total_hours).toBeGreaterThan(0);
    });
  });

  describe('Progress Modes', () => {
    it('stage-based packages track by stage completion', () => {
      expect(mockPackages.kickStart.progress_mode).toBe('stage');
      expect(mockPackages.healthCheck.progress_mode).toBe('stage');
    });

    it('hours-based packages track by time consumed', () => {
      expect(mockPackages.membership.progress_mode).toBe('hours');
    });
  });
});

describe('Package Instance Lifecycle', () => {
  describe('Instance Creation', () => {
    it('new instances have correct initial state', () => {
      const instance = mockPackageInstances.activeKickStart;
      expect(instance.is_complete).toBe(false);
      expect(instance.hours_used).toBeLessThan(instance.hours_included);
      expect(new Date(instance.start_date).getTime()).toBeLessThanOrEqual(new Date(instance.end_date!).getTime());
    });

    it('hours_included matches or overrides package default', () => {
      expect(mockPackageInstances.activeKickStart.hours_included).toBe(40);
      expect(mockPackageInstances.activeMembership.hours_included).toBe(120);
    });
  });

  describe('Instance Completion', () => {
    it('completed instances are marked complete', () => {
      expect(mockPackageInstances.completedHealthCheck.is_complete).toBe(true);
      expect(mockPackageInstances.completedHealthCheck.status).toBe('complete');
    });

    it('completed instances have used all hours', () => {
      const completed = mockPackageInstances.completedHealthCheck;
      expect(completed.hours_used).toBe(completed.hours_included);
    });
  });
});

describe('Stage Dependencies', () => {
  describe('Stage Order', () => {
    it('stages define dependency chain via requires_stage_keys', () => {
      expect(mockStages.scopingCall.requires_stage_keys).toBeNull();
      expect(mockStages.policyReview.requires_stage_keys).toContain('scoping-call');
      expect(mockStages.finalReport.requires_stage_keys).toContain('policy-review');
    });

    it('stage keys are unique identifiers', () => {
      const keys = [
        mockStages.scopingCall.stage_key,
        mockStages.policyReview.stage_key,
        mockStages.finalReport.stage_key,
      ];
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('Dependency Validation', () => {
    function canStartStage(
      stageKey: string,
      completedStageKeys: string[],
      allStages: typeof mockStages
    ): boolean {
      const stageEntry = Object.values(allStages).find(s => s.stage_key === stageKey);
      if (!stageEntry) return false;
      
      const requires = stageEntry.requires_stage_keys || [];
      return requires.every(reqKey => completedStageKeys.includes(reqKey));
    }

    it('first stage can start immediately', () => {
      expect(canStartStage('scoping-call', [], mockStages)).toBe(true);
    });

    it('dependent stage requires prerequisite completion', () => {
      expect(canStartStage('policy-review', [], mockStages)).toBe(false);
      expect(canStartStage('policy-review', ['scoping-call'], mockStages)).toBe(true);
    });

    it('final stage requires chain completion', () => {
      expect(canStartStage('final-report', [], mockStages)).toBe(false);
      expect(canStartStage('final-report', ['scoping-call'], mockStages)).toBe(false);
      expect(canStartStage('final-report', ['scoping-call', 'policy-review'], mockStages)).toBe(true);
    });
  });
});

describe('Stage Instance Progression', () => {
  describe('Status Transitions', () => {
    it('stages progress through valid statuses', () => {
      const validStatuses = ['pending', 'in_progress', 'complete', 'skipped'];
      expect(validStatuses).toContain(mockStageInstances.scopingComplete.status);
      expect(validStatuses).toContain(mockStageInstances.policiesInProgress.status);
      expect(validStatuses).toContain(mockStageInstances.reportPending.status);
    });

    it('completed stages have completion timestamp', () => {
      expect(mockStageInstances.scopingComplete.completed_at).not.toBeNull();
    });

    it('pending stages have no start timestamp', () => {
      expect(mockStageInstances.reportPending.started_at).toBeNull();
      expect(mockStageInstances.reportPending.completed_at).toBeNull();
    });

    it('in-progress stages have start but no completion', () => {
      expect(mockStageInstances.policiesInProgress.started_at).not.toBeNull();
      expect(mockStageInstances.policiesInProgress.completed_at).toBeNull();
    });
  });
});

describe('Time Tracking', () => {
  describe('Time Entry Sources', () => {
    it('manual entries are user-submitted', () => {
      expect(mockTimeEntries.manualEntry.source).toBe('manual');
    });

    it('timer entries come from stopwatch', () => {
      expect(mockTimeEntries.timerEntry.source).toBe('timer');
    });

    it('calendar entries come from Outlook sync', () => {
      expect(mockTimeEntries.calendarEntry.source).toBe('calendar');
    });
  });

  describe('Duration Calculations', () => {
    it('entries have positive duration', () => {
      expect(mockTimeEntries.manualEntry.duration_minutes).toBeGreaterThan(0);
      expect(mockTimeEntries.timerEntry.duration_minutes).toBeGreaterThan(0);
      expect(mockTimeEntries.calendarEntry.duration_minutes).toBeGreaterThan(0);
    });

    it('calculates total time correctly', () => {
      const totalMinutes = 
        mockTimeEntries.manualEntry.duration_minutes +
        mockTimeEntries.timerEntry.duration_minutes +
        mockTimeEntries.calendarEntry.duration_minutes;
      
      expect(totalMinutes).toBe(90 + 180 + 60); // 330 minutes
    });
  });
});

describe('Package Usage Calculations', () => {
  describe('Usage Metrics', () => {
    it('calculates usage percentage correctly', () => {
      const usage = calculatePackageUsage(mockPackageInstances.activeKickStart);
      expect(usage.included_minutes).toBe(40 * 60); // 2400
      expect(usage.used_minutes).toBe(10 * 60); // 600
      expect(usage.remaining_minutes).toBe(30 * 60); // 1800
      expect(usage.used_percent).toBe(25);
    });

    it('100% usage when hours exhausted', () => {
      const usage = calculatePackageUsage(mockPackageInstances.completedHealthCheck);
      expect(usage.used_percent).toBe(100);
      expect(usage.remaining_minutes).toBe(0);
    });
  });
});

describe('Alert Thresholds', () => {
  describe('Alert Creation', () => {
    it('warning alerts at 75% threshold', () => {
      expect(mockAlerts.warningAlert.threshold_percent).toBe(75);
      expect(mockAlerts.warningAlert.severity).toBe('warning');
    });

    it('critical alerts at 90% threshold', () => {
      expect(mockAlerts.criticalAlert.threshold_percent).toBe(90);
      expect(mockAlerts.criticalAlert.severity).toBe('critical');
    });
  });

  describe('Alert Dismissal', () => {
    it('active alerts are not dismissed', () => {
      expect(mockAlerts.warningAlert.is_dismissed).toBe(false);
      expect(mockAlerts.criticalAlert.is_dismissed).toBe(false);
    });

    it('dismissed alerts are marked', () => {
      expect(mockAlerts.dismissedAlert.is_dismissed).toBe(true);
    });
  });

  describe('Alert Filtering', () => {
    function getActiveAlerts(alerts: typeof mockAlerts) {
      return Object.values(alerts).filter(a => !a.is_dismissed);
    }

    it('filters out dismissed alerts', () => {
      const active = getActiveAlerts(mockAlerts);
      expect(active.length).toBe(2);
      expect(active.every(a => !a.is_dismissed)).toBe(true);
    });
  });
});

describe('Utility Functions', () => {
  describe('formatHours', () => {
    function formatHours(minutes: number): string {
      const hours = minutes / 60;
      if (hours < 1) return `${Math.round(minutes)}m`;
      return `${hours.toFixed(1)}h`;
    }

    it('formats minutes under 1 hour', () => {
      expect(formatHours(30)).toBe('30m');
      expect(formatHours(45)).toBe('45m');
    });

    it('formats hours with decimal', () => {
      expect(formatHours(60)).toBe('1.0h');
      expect(formatHours(90)).toBe('1.5h');
      expect(formatHours(150)).toBe('2.5h');
    });
  });

  describe('formatForecast', () => {
    function formatForecast(days: number | null): string {
      if (days === null) return 'No recent activity';
      if (days <= 0) return 'Exhausted';
      if (days === 1) return '~1 day remaining';
      if (days < 7) return `~${days} days remaining`;
      if (days < 30) return `~${Math.round(days / 7)} weeks remaining`;
      return `~${Math.round(days / 30)} months remaining`;
    }

    it('handles null (no activity)', () => {
      expect(formatForecast(null)).toBe('No recent activity');
    });

    it('handles exhausted hours', () => {
      expect(formatForecast(0)).toBe('Exhausted');
      expect(formatForecast(-5)).toBe('Exhausted');
    });

    it('formats days correctly', () => {
      expect(formatForecast(1)).toBe('~1 day remaining');
      expect(formatForecast(5)).toBe('~5 days remaining');
    });

    it('formats weeks correctly', () => {
      expect(formatForecast(14)).toBe('~2 weeks remaining');
      expect(formatForecast(21)).toBe('~3 weeks remaining');
    });

    it('formats months correctly', () => {
      expect(formatForecast(60)).toBe('~2 months remaining');
      expect(formatForecast(90)).toBe('~3 months remaining');
    });
  });
});
