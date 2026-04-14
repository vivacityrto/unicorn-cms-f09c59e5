import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, ClipboardList, Building2, ArrowRight, ArrowLeft, Loader2, Award, Globe, Info } from 'lucide-react';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useCreateAudit } from '@/hooks/useClientAudits';
import type { AuditType } from '@/types/clientAudits';
import { detectRegistrationType, isCricosValid } from '@/types/clientAudits';
import { cn } from '@/lib/utils';

interface NewAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTenantId?: number;
  preselectedTenantName?: string;
  preselectedAuditType?: AuditType;
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
    description: 'Compliance and risk assessment for clients considering purchasing an RTO.',
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
    description: 'Compliance and risk assessment for clients considering purchasing a CRICOS provider.',
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
    description: 'Compliance and risk assessment for clients considering purchasing an RTO.',
    is_rto: true, is_cricos: true, template_id: TEMPLATE_IDS.due_diligence,
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
];

interface TenantRecord {
  id: number;
  name: string;
  rto_id: string | null;
  rto_name: string | null;
  cricos_id: string | null;
  org_type: string | null;
  profile_cricos_number: string | null;
}

export function NewAuditModal({ open, onOpenChange, preselectedTenantId, preselectedTenantName, preselectedAuditType }: NewAuditModalProps) {
  const hasPreselectedType = !!preselectedAuditType;
  const [step, setStep] = useState(hasPreselectedType ? 2 : 1);
  const [selectedCard, setSelectedCard] = useState<AuditTypeCard | null>(null);

  // Step 2
  const [tenantId, setTenantId] = useState<number | null>(preselectedTenantId || null);
  const [tenantName, setTenantName] = useState(preselectedTenantName || '');
  const [title, setTitle] = useState('');
  const [conductedAt, setConductedAt] = useState('');
  const [leadAuditorId, setLeadAuditorId] = useState('');
  const [assistedById, setAssistedById] = useState('');
  const [trainingProducts, setTrainingProducts] = useState('');
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

  const selectedTenant = useMemo(() => tenants.find(t => t.id === tenantId), [tenants, tenantId]);
  const registrationType = useMemo(() => {
    if (!selectedTenant) return null;
    // Use org_type from tenant_profile as primary source (matches the OrgTypeBadge)
    const ot = selectedTenant.org_type;
    if (ot === 'rto_cricos') return 'both' as const;
    if (ot === 'cricos') return 'cricos_only' as const;
    if (ot === 'rto') return 'rto_only' as const;
    // Fallback to field-level detection
    return detectRegistrationType(selectedTenant.rto_id, selectedTenant.profile_cricos_number || selectedTenant.cricos_id);
  }, [selectedTenant]);

  const auditTypeCards = useMemo(() => {
    if (!registrationType) return ALL_CARDS;
    if (registrationType === 'rto_only') return RTO_ONLY_CARDS;
    if (registrationType === 'cricos_only') return CRICOS_ONLY_CARDS;
    return BOTH_CARDS;
  }, [registrationType]);

  // Determine if audit involves CRICOS
  const auditIsCricos = selectedCard?.is_cricos ?? false;

  useEffect(() => {
    if (!open) return;
    setTenantsLoading(true);
    supabase.from('tenants').select('id, name, rto_id, rto_name, cricos_id, tenant_profile(org_type, cricos_number)').order('name').then(({ data }) => {
      const mapped = ((data as any[]) || []).map(t => ({
        id: t.id,
        name: t.name,
        rto_id: t.rto_id,
        rto_name: t.rto_name,
        cricos_id: t.cricos_id,
        org_type: t.tenant_profile?.org_type || null,
        profile_cricos_number: t.tenant_profile?.cricos_number || null,
      }));
      setTenants(mapped);
      setTenantsLoading(false);
    });
    supabase.from('users').select('user_uuid, first_name, last_name').eq('is_vivacity_internal', true).then(({ data }) => {
      setAuditors(((data as any[]) || []).map(u => ({ user_uuid: u.user_uuid, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() })));
    });
  }, [open]);

  // Pre-select card from preselectedAuditType
  useEffect(() => {
    if (preselectedAuditType && auditTypeCards.length > 0 && !selectedCard) {
      const match = auditTypeCards.find(c => c.value === preselectedAuditType);
      if (match) setSelectedCard(match);
    }
  }, [preselectedAuditType, auditTypeCards]);

  // Clear stale card selection when registration type changes
  useEffect(() => {
    if (selectedCard) {
      const stillValid = auditTypeCards.some(
        c => c.value === selectedCard.value && c.is_rto === selectedCard.is_rto && c.is_cricos === selectedCard.is_cricos
      );
      if (!stillValid) setSelectedCard(null);
    }
  }, [registrationType, auditTypeCards]);

  // Auto-fetch snapshot from TGA view when tenant selected
  useEffect(() => {
    if (!tenantId) return;
    const t = tenants.find(t => t.id === tenantId);
    if (t) setTenantName(t.name);
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
  }, [tenantId, tenants]);

  const resetForm = () => {
    setStep(preselectedAuditType ? 2 : 1);
    setSelectedCard(null);
    if (!preselectedTenantId) { setTenantId(null); setTenantName(''); }
    setTitle(''); setConductedAt(''); setLeadAuditorId(''); setAssistedById('');
    setTrainingProducts(''); setDocNumber('');
    setRtoName(''); setRtoNumber(''); setCricosCode('');
    setSiteAddress(''); setCeo(''); setPhone(''); setEmail(''); setWebsite('');
    setOverseasStudentCount(''); setEducationAgents(''); setPrismsUsers(''); setDhaContact('');
  };

  useEffect(() => { if (!open) resetForm(); }, [open]);

  const handleSave = () => {
    if (!selectedCard || !tenantId) return;
    createAudit.mutate({
      audit_type: selectedCard.value,
      subject_tenant_id: tenantId,
      client_name: tenantName,
      is_rto: selectedCard.is_rto,
      is_cricos: selectedCard.is_cricos,
      template_id: selectedCard.template_id,
      title: title || undefined,
      conducted_at: conductedAt || undefined,
      lead_auditor_id: leadAuditorId || undefined,
      assisted_by_id: assistedById || undefined,
      training_products: trainingProducts ? trainingProducts.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      doc_number: docNumber || undefined,
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
                      <Badge variant="outline" className="text-[10px] bg-blue-50 border-blue-200">RTO: {selectedTenant.rto_id}</Badge>
                      <Badge variant="outline" className="text-[10px] bg-teal-50 border-teal-200">CRICOS: {selectedTenant.cricos_id}</Badge>
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
              <div>
                <Label>Client *</Label>
                {isClientLocked ? (
                  <Input value={tenantName} disabled />
                ) : (
                  <Select value={tenantId?.toString() || ''} onValueChange={v => setTenantId(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map(t => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}{t.rto_id ? ` (${t.rto_id})` : ''}{isCricosValid(t.cricos_id) ? ` [CRICOS: ${t.cricos_id}]` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Audit Title (optional)</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-generated if left blank" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Conducted On</Label>
                  <Input type="date" value={conductedAt} onChange={e => setConductedAt(e.target.value)} />
                </div>
                <div>
                  <Label>Doc Number</Label>
                  <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="e.g. CHC-2026-001" />
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
              {selectedCard?.value !== 'due_diligence' && (
                <div>
                  <Label>Training Products in Scope</Label>
                  <Input value={trainingProducts} onChange={e => setTrainingProducts(e.target.value)} placeholder="Comma-separated qualification codes" />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These details are captured at the time of the audit. They will appear in the final report exactly as shown here.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>RTO Name</Label><Input value={rtoName} onChange={e => setRtoName(e.target.value)} /></div>
                <div><Label>RTO Number</Label><Input value={rtoNumber} onChange={e => setRtoNumber(e.target.value)} /></div>
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
              <Button onClick={handleSave} disabled={createAudit.isPending}>
                {createAudit.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create Audit'}
              </Button>
            )}
          </div>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
