import { describe, expect, it } from 'vitest';
import { buildStaffSections, roleLabel, sectionForPath, type StaffMenuContext } from './staffMenu';

const ctx = (over: Partial<StaffMenuContext> = {}): StaffMenuContext => ({
  userRole: 'Team Member', isSuperAdmin: false, isTeamLeader: false, isIntegrator: false, isCSC: false, isVivacityTeam: true, ...over,
});
const titles = (c: StaffMenuContext) => buildStaffSections(c).map((s) => s.title);
const labels = (c: StaffMenuContext, key: string) => buildStaffSections(c).find((s) => s.key === key)?.items.map((i) => i.label) ?? [];

describe('role names in full', () => {
  it('spells out the abbreviations and leaves the rest as they are', () => {
    expect(roleLabel('CSC')).toBe('Client Success Champion');
    expect(roleLabel('BGT')).toBe('Business Growth Team');
    expect(roleLabel('Super Admin')).toBe('Super Admin');
    expect(roleLabel('Team Leader')).toBe('Team Leader');
    expect(roleLabel('Integrator')).toBe('Integrator');
    expect(roleLabel(null)).toBe('Team member');
  });
});

describe('the staff menu keeps the order people are used to', () => {
  const superAdmin = ctx({ userRole: 'Super Admin', isSuperAdmin: true });

  it('lists the groups in the long-standing order for a Super Admin', () => {
    expect(titles(superAdmin)).toEqual(['Work', 'Clients', 'EOS', 'Resource Management', 'Administration', 'Academy', 'System Config', 'Strategic Intelligence']);
  });

  it('keeps the pages inside the Work and Clients groups in their order', () => {
    expect(labels(superAdmin, 'work')).toEqual([
      'Dashboard', 'Ask Viv', 'Triage Dashboard', 'Executive Dashboard', 'Inbox', 'Email Triage', 'My Work', 'Tasks', 'KPI', 'Time Inbox', 'My Calendar', 'Meetings', 'Event Calendar', 'Vivacity Academy',
    ]);
    expect(labels(superAdmin, 'clients')).toEqual([
      'Clients', 'Client Activity', 'Documents', 'Communications', 'Support Tickets', 'RTO Tips', 'Audits', 'Cert & Contact Register',
    ]);
  });
});

describe('what each role is shown', () => {
  it('a Client Success Champion sees Academy and the certificate register, but not System Config or Resource Management', () => {
    const csc = ctx({ userRole: 'CSC', isCSC: true });
    expect(titles(csc)).toEqual(['Work', 'Clients', 'EOS', 'Administration', 'Academy', 'Strategic Intelligence']);
    expect(labels(csc, 'clients')).toContain('Cert & Contact Register');
  });

  it('a Business Growth Team member has no certificate register, Academy, or leadership pages', () => {
    const bgt = ctx({ userRole: 'BGT' });
    expect(titles(bgt)).toEqual(['Work', 'Clients', 'EOS', 'Administration', 'Strategic Intelligence']);
    expect(labels(bgt, 'clients')).not.toContain('Cert & Contact Register');
    expect(labels(bgt, 'work')).not.toContain('Executive Dashboard');
    expect(labels(bgt, 'eos')).not.toContain('Leadership Dashboard');
    expect(labels(bgt, 'work')).toContain('Email Triage');
  });

  it('only a Super Admin or Team Leader sees Resource Management and the executive pages', () => {
    const leader = ctx({ userRole: 'Team Leader', isTeamLeader: true });
    expect(titles(leader)).toContain('Resource Management');
    expect(labels(leader, 'work')).toContain('Executive Dashboard');
    expect(titles(ctx())).not.toContain('Resource Management');
  });

  it('a Super Admin sees every Strategic Intelligence page, everyone else only Regulator Watch', () => {
    expect(labels(ctx({ isSuperAdmin: true, userRole: 'Super Admin' }), 'strategicIntelligence').length).toBeGreaterThan(1);
    expect(labels(ctx(), 'strategicIntelligence')).toEqual(['Regulator Watch']);
  });

  it('gates administration pages by role as before', () => {
    expect(labels(ctx(), 'administration')).not.toContain('Manage Invites');
    expect(labels(ctx({ isSuperAdmin: true, userRole: 'Super Admin' }), 'administration')).toContain('Manage Invites');
    expect(labels(ctx({ userRole: 'Integrator', isIntegrator: true }), 'administration')).toContain('People');
  });
});

describe('badges and attention', () => {
  it('puts unread messages and open tickets on their pages and flags the Clients group', () => {
    const sections = buildStaffSections(ctx({ teamUnreadCount: 2, myAssignedConvosCount: 1, supportTicketsCount: 4 }));
    const clients = sections.find((s) => s.key === 'clients')!;
    expect(clients.alert).toBe(true);
    expect(clients.items.find((i) => i.path === '/communications')?.badge).toBe(3);
    expect(clients.items.find((i) => i.path === '/support-tickets')?.badge).toBe(4);
    expect(sections.find((s) => s.key === 'work')!.alert).toBe(false);
  });

  it('shows no badge and no flag when nothing is waiting', () => {
    const clients = buildStaffSections(ctx()).find((s) => s.key === 'clients')!;
    expect(clients.alert).toBe(false);
    expect(clients.items.every((i) => i.badge === undefined)).toBe(true);
  });
});

describe('finding the group of a page', () => {
  it('names the group a path belongs to, or none', () => {
    const sections = buildStaffSections(ctx());
    expect(sectionForPath(sections, '/manage-tenants')).toBe('clients');
    expect(sectionForPath(sections, '/eos/rocks')).toBe('eos');
    expect(sectionForPath(sections, '/nowhere')).toBeNull();
  });
});
