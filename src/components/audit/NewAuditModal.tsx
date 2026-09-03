import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, ClipboardList, Building2, ArrowRight, ArrowLeft, Loader2, Award, Globe, Info, Link2, Target } from 'lucide-react';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCreateAudit } from '@/hooks/useClientAudits';
import { useAuth } from '@/hooks/useAuth';
import { STAGE_AUDIT_TYPE_MAP } from '@/hooks/useStageAuditLink';
import type { AuditType } from '@/types/clientAudits';
import { detectRegistrationType, isCricosValid } from '@/types/clientAudits';
import { cn } from '@/lib/utils';
import { ScopeMultiSelect } from './ScopeMultiSelect';
import { TgaRtoLookupRow } from './TgaRtoLookupRow';
import type { TargetRtoSnapshot as TgaSnapshot } from '@/lib/tga/lookupTargetRto';
import { toast } from 'sonner';

const STAGE_NAME_MAP: Record<number, string> = {
  24: 'Compliance Health Check',
  5: 'Mock Audit',
  1106: 'Mock Audit & Submission',
};

interface NewAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTenantId?: number;
  preselectedTenantName?: string;
  preselectedAuditType?: AuditType;
  preselectedStageInstanceId?: number;
}

interface AuditTypeCard {
  value: AuditType;
  label: string;
  icon: any;
  description: string;
  badge?: string;
  badgeColor?: string;
  recommended?: boolean;
  is_rto: boolean;
  is_cricos: boolean;
  template_id: string;
}

const TEMPLATE_IDS: Record<AuditType, string> = {
  compliance_health_check: 'cc025000-0000-0000-0000-000000000001',
  cricos_chc: '788a5beb-93b2-48fd-a262-b313060823f4',
  rto_cricos_chc: 'bc025000-0000-0000-0000-000000000001',
  mock_audit: 'a0025000-0000-0000-0000-000000000001',
  cricos_mock_audit: '788a5beb-93b2-48fd-a262-b313060823f4',
  due_diligence: 'd0025000-0000-0000-0000-000000000001',
  due_diligence_combined: 'dc025000-0000-0000-0000-000000000001',
};

// Cards per registration type
const RTO_ONLY_CARDS: AuditTypeCard[] = [
  {
    value: 'compliance_health_check', label: 'SRTO 2025 — Annual CHC', icon: ShieldCheck,
    description: 'Annual compliance review against the Standards for Registered Training Organisations 2025.',
    is_rto: true, is_cricos: false, template_id: TEMPLATE_IDS.compliance_health_check,
  },
  {
    value: 'mock_audit', label: 'Mock ASQA Audit', icon: ClipboardList,
    description: 'Simulated ASQA audit for RTOs preparing for initial registration or re-registration.',
    is_rto: true, is_cricos: false, template_id: TEMPLATE_IDS.mock_audit,
  },
  {
    value: 'due_diligence', label: 'RTO Due Diligence', icon: Building2,
    description: 'Compliance and risk assessment for the Purchaser of an RTO.',
    is_rto: true, is_cricos: false, template_id: TEMPLATE_IDS.due_diligence,
  },
];

const CRICOS_ONLY_CARDS: AuditTypeCard[] = [
  {
    value: 'cricos_chc', label: 'National Code 2018 — Annual CHC', icon: Globe,
    description: 'Annual compliance review against the National Code of Practice for Providers of Education and Training to Overseas Students 2018.',
    badge: 'CRICOS', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200',
    is_rto: false, is_cricos: true, template_id: TEMPLATE_IDS.cricos_chc,
  },
  {
    value: 'due_diligence', label: 'Due Diligence', icon: Building2,
    description: 'Compliance and risk assessment for the Purchaser of a CRICOS provider.',
    is_rto: false, is_cricos: true, template_id: TEMPLATE_IDS.due_diligence,
  },
];

const BOTH_CARDS: AuditTypeCard[] = [
  {
    value: 'rto_cricos_chc', label: 'SRTO 2025 + National Code 2018 — Combined CHC', icon: Award,
    description: 'Annual compliance review covering both SRTO 2025 and all National Code 2018 standards in one audit. Covers 30 sections.',
    badge: 'Recommended', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200', recommended: true,
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.rto_cricos_chc,
  },
  {
    value: 'compliance_health_check', label: 'SRTO 2025 only — CHC', icon: ShieldCheck,
    description: 'Annual RTO compliance review. Select this if the CRICOS component will be audited separately.',
    is_rto: true, is_cricos: false, template_id: TEMPLATE_IDS.compliance_health_check,
  },
  {
    value: 'cricos_chc', label: 'National Code 2018 only — CHC', icon: Globe,
    description: 'CRICOS compliance review only. Select this if the RTO component will be audited separately.',
    badge: 'CRICOS', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200',
    is_rto: false, is_cricos: true, template_id: TEMPLATE_IDS.cricos_chc,
  },
  {
    value: 'due_diligence', label: 'Due Diligence', icon: Building2,
    description: 'Compliance and risk assessment for the Purchaser of an RTO.',
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.due_diligence,
  },
  {
    value: 'due_diligence_combined', label: 'Combined RTO + CRICOS Due Diligence', icon: Building2,
    description: 'Compliance and risk assessment for the Purchaser of a dual-registered RTO with CRICOS registration.',
    badge: 'CRICOS', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200',
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.due_diligence_combined,
  },
];

// Fallback when no client selected
const ALL_CARDS: AuditTypeCard[] = [
  ...RTO_ONLY_CARDS,
  {
    value: 'cricos_chc', label: 'CRICOS CHC', icon: Globe,
    description: 'Annual compliance review against the National Code 2018.',
    badge: 'CRICOS', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200',
    is_rto: false, is_cricos: true, template_id: TEMPLATE_IDS.cricos_chc,
  },
  {
    value: 'rto_cricos_chc', label: 'Combined RTO + CRICOS CHC', icon: Award,
    description: 'Combined SRTO 2025 and National Code 2018 audit.',
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.rto_cricos_chc,
  },
  {
    value: 'due_diligence_combined', label: 'Combined RTO + CRICOS Due Diligence', icon: Building2,
    description: 'Compliance and risk assessment for the Purchaser of a dual-registered RTO with CRICOS registration.',
    badge: 'CRICOS', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200',
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.due_diligence_combined,
  },
];

interface TenantRecord {
  id: number;
  name: string;
  tenant_type: string | null;
  status: string | null;
  rto_id: string | null;
  rto_name: string | null;
  cricos_id: string | null;
  org_type: string | null;
  profile_cricos_number: string | null;
}

export function NewAuditModal({ open, onOpenChange, preselectedTenantId, preselectedTenantName, preselectedAuditType, preselectedStageInstanceId }: NewAuditModalProps) {
  // Resolve stage context: map stage instance → audit type if not already provided
  const [resolvedStageId, setResolvedStageId] = useState<number | null>(null);
  
  useEffect(() => {
    if (!open || !preselectedStageInstanceId) { setResolvedStageId(null); return; }
    supabase
      .from('stage_instances' as any)
      .select('stage_id')
      .eq('id', preselectedStageInstanceId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setResolvedStageId((data as any).stage_id);
      });
  }, [open, preselectedStageInstanceId]);

  const stageAuditType = preselectedAuditType || (resolvedStageId ? STAGE_AUDIT_TYPE_MAP[resolvedStageId] : undefined);
  const stageName = resolvedStageId ? STAGE_NAME_MAP[resolvedStageId] : null;
  const hasPreselectedType = !!stageAuditType;
  const isStageLinked = !!preselectedStageInstanceId;
  
  const [step, setStep] = useState(hasPreselectedType ? 2 : 1);
  const [selectedCard, setSelectedCard] = useState<AuditTypeCard | null>(null);

  // Step 2
  const [tenantId, setTenantId] = useState<number | null>(preselectedTenantId || null);
  const [tenantName, setTenantName] = useState(preselectedTenantName || '');
  const [title, setTitle] = useState('');
  const [leadAuditorId, setLeadAuditorId] = useState('');
  const [assistedById, setAssistedById] = useState('');
  const [trainingProductCodes, setTrainingProductCodes] = useState<string[]>([]);
  const [docNumber, setDocNumber] = useState('');

  // Step 3 snapshot
  const [rtoName, setRtoName] = useState('');
  const [rtoNumber, setRtoNumber] = useState('');
  const [cricosCode, setCricosCode] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [ceo, setCeo] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  // CRICOS snapshot fields
  const [overseasStudentCount, setOverseasStudentCount] = useState('');
  const [educationAgents, setEducationAgents] = useState('');
  const [prismsUsers, setPrismsUsers] = useState('');
  const [dhaContact, setDhaContact] = useState('');

  // Lookups
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [auditors, setAuditors] = useState<{ user_uuid: string; name: string }[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const createAudit = useCreateAudit();
  const { session } = useAuth();

  const selectedTenant = useMemo(() => tenants.find(t => t.id === tenantId), [tenants, tenantId]);
  const registrationType = useMemo(() => {
    if (!selectedTenant) return null;
    // Match OrgTypeBadge logic in useClientManagement.tsx — a tenant with both
    // rto_id and cricos_id is dual-registered even when tenant_profile.org_type
    // only says 'rto'. Derive from registration fields first.
    const hasRto = !!selectedTenant.rto_id;
    const cricosVal = selectedTenant.profile_cricos_number || selectedTenant.cricos_id;
    const hasCricos = isCricosValid(cricosVal);
    const ot = selectedTenant.org_type; // org_type supplements missing registration fields
    if (hasRto && hasCricos) return 'both' as const;
    if (hasCricos && !hasRto) {
      if (ot === 'rto_cricos') return 'both' as const;
      return 'cricos_only' as const;
    }
    if (hasRto && !hasCricos) {
      if (ot === 'rto_cricos' || ot === 'cricos') return 'both' as const;
      return 'rto_only' as const;
    }
    if (ot === 'rto_cricos') return 'both' as const;
    if (ot === 'cricos') return 'cricos_only' as const;
    if (ot === 'rto') return 'rto_only' as const;
    return detectRegistrationType(selectedTenant.rto_id, cricosVal);
  }, [selectedTenant]);

  const auditTypeCards = useMemo(() => {
    if (!registrationType) return ALL_CARDS;
    if (registrationType === 'rto_only') return RTO_ONLY_CARDS;
    if (registrationType === 'cricos_only') return CRICOS_ONLY_CARDS;
    return BOTH_CARDS;
  }, [registrationType]);

  // Determine if audit involves CRICOS
  const auditIsCricos = selectedCard?.is_cricos ?? false;
  const isDueDiligence = selectedCard?.value === 'due_diligence' || selectedCard?.value === 'due_diligence_combined';

  useEffect(() => {
    if (!open) return;
    setTenantsLoading(true);
    const fetchTenants = async () => {
      // Fetch active tenants — primary list for dropdown
      const { data: tenantsData, error: tenantsError } = await (supabase as any)
        .from('tenants')
        .select('id, name, tenant_type, status, rto_id, rto_name, cricos_id')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (tenantsError) {
        console.error('[NewAuditModal] Failed to fetch tenants:', tenantsError);
        setTenants([]);
        setTenantsLoading(false);
        return;
      }

      const rows = (tenantsData as any[]) || [];
      const ids = rows.map(r => r.id);

      // Enrich with tenant_profile (no FK to embed, so query separately)
      const profileMap: Record<number, { org_type: string | null; cricos_number: string | null }> = {};
      if (ids.length) {
        const { data: profiles } = await (supabase as any)
          .from('tenant_profile')
          .select('tenant_id, org_type, cricos_number')
          .in('tenant_id', ids);
        for (const p of (profiles as any[]) || []) {
          profileMap[p.tenant_id] = { org_type: p.org_type ?? null, cricos_number: p.cricos_number ?? null };
        }
      }

      const mapped: TenantRecord[] = rows.map((t: any) => ({
        id: t.id,
        name: t.name,
        tenant_type: t.tenant_type ?? null,
        status: t.status ?? null,
        rto_id: t.rto_id,
        rto_name: t.rto_name,
        cricos_id: t.cricos_id,
        org_type: profileMap[t.id]?.org_type ?? null,
        profile_cricos_number: profileMap[t.id]?.cricos_number ?? null,
      }));
      setTenants(mapped);
      setTenantsLoading(false);
    };
    fetchTenants();
    supabase.from('users').select('user_uuid, first_name, last_name').eq('is_vivacity_internal', true).eq('is_system_account', false).or('kpi_pod.is.null,kpi_pod.neq.qa').then(({ data }) => {
      setAuditors(((data as any[]) || []).map(u => ({ user_uuid: u.user_uuid, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() })));
    });
  }, [open]);

  // Default lead auditor to current user
  useEffect(() => {
    if (auditors.length > 0 && !leadAuditorId && session?.user?.id) {
      const match = auditors.find(a => a.user_uuid === session.user.id);
      if (match) setLeadAuditorId(match.user_uuid);
    }
  }, [auditors, session?.user?.id, leadAuditorId]);

  // Pre-select card from stageAuditType (resolved from stage or preselected)
  useEffect(() => {
    if (stageAuditType && auditTypeCards.length > 0 && !selectedCard) {
      const match = auditTypeCards.find(c => c.value === stageAuditType);
      if (match) {
        setSelectedCard(match);
        if (isStageLinked) setStep(2); // Skip Step 1 when stage-linked
      }
    }
  }, [stageAuditType, auditTypeCards, isStageLinked, selectedCard]);

  // Clear stale card selection when registration type changes — only on Step 1.
  // After the user has advanced to Step 2/3 the card has already passed the
  // selection gate; silently nulling it would make the Create Audit button
  // appear broken (handleSave returns early when selectedCard is null).
  useEffect(() => {
    if (step !== 1) return;
    if (!selectedCard) return;
    const stillValid = auditTypeCards.some(
      c => c.value === selectedCard.value && c.is_rto === selectedCard.is_rto && c.is_cricos === selectedCard.is_cricos
    );
    if (!stillValid) setSelectedCard(null);
  }, [registrationType, auditTypeCards, step, selectedCard]);

  // Auto-fetch snapshot from TGA view when tenant selected.
  // For Due Diligence audits the snapshot describes the *Target RTO* (entered separately
  // via the Target RTO lookup), NOT the Purchaser — so skip the purchaser auto-fill.
  useEffect(() => {
    if (!tenantId) return;
    const t = tenants.find(t => t.id === tenantId);
    if (t) setTenantName(t.name);
    const isDD = selectedCard?.value === 'due_diligence' || selectedCard?.value === 'due_diligence_combined';
    if (isDD) return;
    supabase
      .from('v_tga_audit_snapshot' as any)
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setRtoName(d.legal_name || t?.rto_name || t?.name || '');
          setRtoNumber(d.rto_code || t?.rto_id || '');
          setCricosCode(d.cricos_codes || '');
          setCeo(d.ceo_name || '');
          setSiteAddress(d.head_office_address || '');
          setPhone(d.contact_phone || '');
          setEmail(d.contact_email || '');
          setWebsite(d.website || '');
        } else {
          setRtoName(t?.rto_name || t?.name || '');
          setRtoNumber(t?.rto_id || '');
        }
      });
  }, [tenantId, tenants, selectedCard?.value]);

  // Clear snapshot fields when switching into a Due Diligence type so leftover
  // Purchaser data doesn't masquerade as the Target RTO.
  useEffect(() => {
    if (isDueDiligence) {
      setRtoName(''); setRtoNumber(''); setCricosCode('');
      setSiteAddress(''); setCeo(''); setPhone(''); setEmail(''); setWebsite('');
    }
     
  }, [isDueDiligence]);

  const resetForm = useCallback(() => {
    setStep(hasPreselectedType ? 2 : 1);
    setSelectedCard(null);
    if (!preselectedTenantId) { setTenantId(null); setTenantName(''); }
    setTitle(''); setLeadAuditorId(''); setAssistedById('');
    setTrainingProductCodes([]); setDocNumber('');
    setRtoName(''); setRtoNumber(''); setCricosCode('');
    setSiteAddress(''); setCeo(''); setPhone(''); setEmail(''); setWebsite('');
    setOverseasStudentCount(''); setEducationAgents(''); setPrismsUsers(''); setDhaContact('');
  }, [hasPreselectedType, preselectedTenantId]);

  useEffect(() => { if (!open) resetForm(); }, [open, resetForm]);

  const handleSave = () => {
    if (!selectedCard || !tenantId) {
      console.warn('[NewAuditModal] Create blocked', { hasCard: !!selectedCard, tenantId });
      toast.error('Please select an audit type and client before creating.');
      return;
    }
    createAudit.mutate({
      audit_type: selectedCard.value,
      subject_tenant_id: tenantId,
      client_name: tenantName,
      is_rto: selectedCard.is_rto,
      is_cricos: selectedCard.is_cricos,
      template_id: selectedCard.template_id,
      title: title || undefined,
      lead_auditor_id: leadAuditorId || undefined,
      assisted_by_id: assistedById || undefined,
      training_products: trainingProductCodes.length ? trainingProductCodes : undefined,
      doc_number: docNumber || undefined,
      linked_stage_instance_id: preselectedStageInstanceId || undefined,
      snapshot_rto_name: rtoName || undefined,
      snapshot_rto_number: rtoNumber || undefined,
      snapshot_cricos_code: cricosCode || undefined,
      snapshot_site_address: siteAddress || undefined,
      snapshot_ceo: ceo || undefined,
      snapshot_phone: phone || undefined,
      snapshot_email: email || undefined,
      snapshot_website: website || undefined,
      snapshot_overseas_student_count: auditIsCricos && overseasStudentCount ? parseInt(overseasStudentCount, 10) : null,
      snapshot_education_agents: auditIsCricos ? educationAgents || null : null,
      snapshot_prisms_users: auditIsCricos ? prismsUsers || null : null,
      snapshot_dha_contact: auditIsCricos ? dhaContact || null : null,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const isClientLocked = !!preselectedTenantId;

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>New Audit — Step {step} of 3</AppModalTitle>
        </AppModalHeader>
        <AppModalBody>
          {step === 1 && (
            <div className="space-y-4">
              {/* Registration type indicator for 'both' */}
              {registrationType === 'both' && selectedTenant && (
                <Alert className="bg-blue-50/50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-sm">
                    This client is registered as both an RTO and a CRICOS provider.
                    <span className="flex gap-2 mt-1">
                      {selectedTenant.rto_id && <Badge variant="outline" className="text-[10px] bg-blue-50 border-blue-200">RTO: {selectedTenant.rto_id}</Badge>}
                      <Badge variant="outline" className="text-[10px] bg-teal-50 border-teal-200">CRICOS: {selectedTenant.profile_cricos_number || selectedTenant.cricos_id || '—'}</Badge>
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {!registrationType && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Select a client first to see the recommended audit types for their registration.
                </p>
              )}

              <div className={cn(
                'grid gap-4',
                auditTypeCards.length <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'
              )}>
                {auditTypeCards.map(card => {
                  const Icon = card.icon;
                  const isSelected = selectedCard?.value === card.value && selectedCard?.is_rto === card.is_rto && selectedCard?.is_cricos === card.is_cricos;
                  return (
                    <Card
                      key={`${card.value}-${card.is_rto}-${card.is_cricos}`}
                      className={cn(
                        'cursor-pointer transition-all hover:shadow-md relative',
                        isSelected && 'ring-2 ring-primary border-primary',
                        card.recommended && !isSelected && 'border-blue-300 bg-blue-50/30'
                      )}
                      onClick={() => setSelectedCard(card)}
                    >
                      <CardContent className="p-5 space-y-2">
                        <div className="flex items-start justify-between">
                          <Icon className="h-8 w-8 text-primary" />
                          {card.badge && (
                            <Badge variant="outline" className={cn('text-[10px]', card.badgeColor)}>{card.badge}</Badge>
                          )}
                        </div>
                        <p className="font-semibold text-sm">{card.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {isStageLinked && stageName && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Link2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">Creating audit for {stageName} stage</span>
                    {preselectedTenantName && <span> — {preselectedTenantName}</span>}
                    <p className="text-xs text-muted-foreground mt-1">
                      This audit will be linked to your package stage. Stage tasks will auto-complete as you progress.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <Label>{isDueDiligence ? 'Client (Purchaser) *' : 'Client *'}</Label>
                {isClientLocked ? (
                  <Input value={tenantName} disabled />
                ) : (
                  <ClientCombobox
                    tenants={tenants}
                    value={tenantId}
                    onSelect={(id) => setTenantId(id)}
                    loading={tenantsLoading}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Audit Title (optional)</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-generated if left blank" />
                </div>
                <div>
                  <Label>Doc Number</Label>
                  <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Auto-generated if blank — e.g. CHC-2025-001" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lead Auditor</Label>
                  <Select value={leadAuditorId} onValueChange={setLeadAuditorId}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {auditors.map(a => (
                        <SelectItem key={a.user_uuid} value={a.user_uuid}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assisted By</Label>
                  <Select value={assistedById} onValueChange={setAssistedById}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {auditors.map(a => (
                        <SelectItem key={a.user_uuid} value={a.user_uuid}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!isDueDiligence && (
                <div>
                  <Label>Training Products in Scope</Label>
                  <ScopeMultiSelect tenantId={tenantId} value={trainingProductCodes} onChange={setTrainingProductCodes} />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {isDueDiligence
                  ? <>These details describe the <strong>Target RTO</strong> under review and will appear in the final report exactly as shown here. The client commissioning the audit ({tenantName || 'the Purchaser'}) remains the Purchaser.</>
                  : 'These details are captured at the time of the audit. They will appear in the final report exactly as shown here.'}
              </p>

              {isDueDiligence && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Target RTO</h4>
                    <span className="text-xs text-muted-foreground">— the RTO being assessed for the Purchaser</span>
                  </div>
                  <div>
                    <TgaRtoLookupRow
                      initialCode={rtoNumber}
                      onResult={(snap: TgaSnapshot) => {
                        const fields: Array<[string, string, (v: string) => void]> = [
                          ['rtoName', snap.rto_name, setRtoName],
                          ['rtoNumber', snap.rto_number, setRtoNumber],
                          ['siteAddress', snap.site_address, setSiteAddress],
                          ['phone', snap.phone, setPhone],
                          ['email', snap.email, setEmail],
                          ['website', snap.website, setWebsite],
                          ['ceo', snap.ceo, setCeo],
                        ];
                        const current: Record<string, string> = {
                          rtoName, rtoNumber, siteAddress, phone, email, website, ceo,
                        };
                        const conflicts = fields.some(([k, v]) => current[k] && v && current[k] !== v);
                        const apply = () => fields.forEach(([_, v, setter]) => { if (v) setter(v); });
                        if (conflicts) {
                          toast('Overwrite manual entries with TGA data?', {
                            action: { label: 'Replace', onClick: apply },
                            cancel: { label: 'Keep mine', onClick: () => {} },
                          });
                        } else {
                          apply();
                        }
                      }}
                      helperText="Fills Target RTO Name, Number, Address, Phone, Email, Website and CEO. CRICOS Code is not included."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Or search by RTO code or name (training.gov.au)</Label>
                    <TargetRtoCombobox
                      onSelect={(snap) => {
                        setRtoName(snap.legal_name || snap.trading_name || '');
                        setRtoNumber(snap.rto_code || '');
                        setCricosCode(snap.cricos_codes || '');
                        setCeo(snap.ceo_name || '');
                        setSiteAddress(snap.head_office_address || '');
                        setPhone(snap.contact_phone || '');
                        setEmail(snap.contact_email || '');
                        setWebsite(snap.website || '');
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      If the Target RTO isn't found above, enter the details manually below.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isDueDiligence ? 'Target RTO Name *' : 'RTO Name'}</Label>
                  <Input value={rtoName} onChange={e => setRtoName(e.target.value)} />
                  {isDueDiligence && !rtoName.trim() && (
                    <p className="text-[11px] text-destructive mt-1">Target RTO Name is required for Due Diligence audits.</p>
                  )}
                </div>
                <div><Label>{isDueDiligence ? 'Target RTO Number' : 'RTO Number'}</Label><Input value={rtoNumber} onChange={e => setRtoNumber(e.target.value)} /></div>
                <div><Label>CRICOS Code</Label><Input value={cricosCode} onChange={e => setCricosCode(e.target.value)} /></div>
                <div><Label>CEO / Principal</Label><Input value={ceo} onChange={e => setCeo(e.target.value)} /></div>
                <div className="col-span-2"><Label>Site Address</Label><Input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="col-span-2"><Label>Website</Label><Input value={website} onChange={e => setWebsite(e.target.value)} /></div>
              </div>

              {/* CRICOS-specific fields */}
              {auditIsCricos && (
                <>
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-teal-600" />
                      CRICOS-Specific Details
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Overseas Student Count</Label>
                        <Input
                          type="number"
                          value={overseasStudentCount}
                          onChange={e => setOverseasStudentCount(e.target.value)}
                          placeholder="Current CRICOS enrolments"
                        />
                      </div>
                      <div>
                        <Label>Education Agents</Label>
                        <Input
                          value={educationAgents}
                          onChange={e => setEducationAgents(e.target.value)}
                          placeholder='Key agent names or "None"'
                        />
                      </div>
                      <div>
                        <Label>PRISMS Users</Label>
                        <Input
                          value={prismsUsers}
                          onChange={e => setPrismsUsers(e.target.value)}
                          placeholder="Staff with PRISMS access"
                        />
                      </div>
                      <div>
                        <Label>DHA Contact</Label>
                        <Input
                          value={dhaContact}
                          onChange={e => setDhaContact(e.target.value)}
                          placeholder="Dept of Home Affairs contact"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      CRICOS-specific details help contextualise overseas student obligations in the audit report.
                    </p>
                  </div>
                </>
              )}

              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span>ℹ️</span>
                <span>Details sourced from the national training register (training.gov.au). You can edit them before saving.</span>
              </p>
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={() => step === 1 ? onOpenChange(false) : setStep(s => s - 1)}>
              {step === 1 ? 'Cancel' : <><ArrowLeft className="h-4 w-4 mr-1" /> Back</>}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={(step === 1 && !selectedCard) || (step === 2 && !tenantId)}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={createAudit.isPending || (isDueDiligence && !rtoName.trim())}>
                {createAudit.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create Audit'}
              </Button>
            )}
          </div>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

interface ClientComboboxProps {
  tenants: TenantRecord[];
  value: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
}

function ClientCombobox({ tenants, value, onSelect, loading }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => tenants.find(t => t.id === value), [tenants, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={loading}
        >
          <span className="truncate">
            {loading
              ? 'Loading clients…'
              : selected
                ? `${selected.name}${selected.rto_id ? ` (${selected.rto_id})` : ''}${isCricosValid(selected.cricos_id) ? ` [CRICOS: ${selected.cricos_id}]` : ''}`
                : 'Select client…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
        >
          <CommandInput placeholder="Search clients by name…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No client found.</CommandEmpty>
            <CommandGroup>
              {tenants.map(t => {
                const label = `${t.name}${t.rto_id ? ` (${t.rto_id})` : ''}${isCricosValid(t.cricos_id) ? ` [CRICOS: ${t.cricos_id}]` : ''}`;
                return (
                  <CommandItem
                    key={t.id}
                    value={label}
                    onSelect={() => { onSelect(t.id); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === t.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TargetRtoSnapshot {
  rto_code: string | null;
  legal_name: string | null;
  trading_name: string | null;
  cricos_codes: string | null;
  ceo_name: string | null;
  head_office_address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
}

interface TargetRtoComboboxProps {
  onSelect: (snap: TargetRtoSnapshot) => void;
}

function TargetRtoCombobox({ onSelect }: TargetRtoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TargetRtoSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<TargetRtoSnapshot | null>(null);

  // Debounced search against v_tga_audit_snapshot
  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await (supabase as any)
        .from('v_tga_audit_snapshot')
        .select('rto_code, legal_name, trading_name, cricos_codes, ceo_name, head_office_address, contact_phone, contact_email, website')
        .or(`rto_code.ilike.%${term}%,legal_name.ilike.%${term}%,trading_name.ilike.%${term}%`)
        .limit(10);
      if (cancelled) return;
      if (error) {
        console.error('[TargetRtoCombobox] search failed', error);
        setResults([]);
      } else {
        setResults((data as TargetRtoSnapshot[]) || []);
      }
      setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, open]);

  const label = picked
    ? `${picked.rto_code || '—'} — ${picked.legal_name || picked.trading_name || ''}`
    : 'Search RTO code or name…';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="e.g. 41020 or Vivacity…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[280px]">
            {loading && <div className="p-3 text-xs text-muted-foreground">Searching…</div>}
            {!loading && search.trim().length < 2 && (
              <div className="p-3 text-xs text-muted-foreground">Type at least 2 characters to search.</div>
            )}
            {!loading && search.trim().length >= 2 && results.length === 0 && (
              <CommandEmpty>No matching RTO found on the national register.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map(r => {
                const display = `${r.rto_code || '—'} — ${r.legal_name || r.trading_name || 'Unnamed'}`;
                return (
                  <CommandItem
                    key={`${r.rto_code}-${r.legal_name}`}
                    value={display}
                    onSelect={() => {
                      setPicked(r);
                      onSelect(r);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', picked?.rto_code === r.rto_code ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{display}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
