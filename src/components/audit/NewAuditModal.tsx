import { useState, useEffect } from 'react';
import { ShieldCheck, ClipboardList, Building2, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/modals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useCreateAudit } from '@/hooks/useClientAudits';
import type { AuditType } from '@/types/clientAudits';
import { cn } from '@/lib/utils';

interface NewAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTenantId?: number;
  preselectedTenantName?: string;
  preselectedAuditType?: AuditType;
}

const auditTypes: { value: AuditType; label: string; icon: any; description: string }[] = [
  {
    value: 'compliance_health_check',
    label: 'Compliance Health Check',
    icon: ShieldCheck,
    description: 'Annual compliance review against SRTO 2025 standards. For existing member RTOs.',
  },
  {
    value: 'mock_audit',
    label: 'Mock Audit',
    icon: ClipboardList,
    description: 'Simulated ASQA audit for RTOs preparing for initial registration or re-registration.',
  },
  {
    value: 'due_diligence',
    label: 'Due Diligence',
    icon: Building2,
    description: 'Compliance and risk assessment for clients considering purchasing an RTO.',
  },
];

export function NewAuditModal({ open, onOpenChange, preselectedTenantId, preselectedTenantName, preselectedAuditType }: NewAuditModalProps) {
  const hasPreselectedType = !!preselectedAuditType;
  const [step, setStep] = useState(hasPreselectedType ? 2 : 1);
  const [auditType, setAuditType] = useState<AuditType | null>(preselectedAuditType || null);

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

  // Lookups
  const [tenants, setTenants] = useState<{ id: number; name: string; rto_id: string | null; rto_name: string | null }[]>([]);
  const [auditors, setAuditors] = useState<{ user_uuid: string; name: string }[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const createAudit = useCreateAudit();

  useEffect(() => {
    if (!open) return;
    // Load tenants
    setTenantsLoading(true);
    supabase.from('tenants').select('id, name, rto_id, rto_name').order('name').then(({ data }) => {
      setTenants((data as any[]) || []);
      setTenantsLoading(false);
    });
    // Load auditors
    supabase.from('users').select('user_uuid, first_name, last_name').eq('is_vivacity_internal', true).then(({ data }) => {
      setAuditors(((data as any[]) || []).map(u => ({ user_uuid: u.user_uuid, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() })));
    });
  }, [open]);

  // Auto-fetch snapshot from TGA view when tenant selected
  useEffect(() => {
    if (!tenantId) return;
    const t = tenants.find(t => t.id === tenantId);
    if (t) {
      setTenantName(t.name);
    }
    // Query v_tga_audit_snapshot for auto-population
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
          // Fallback to basic tenant data
          setRtoName(t?.rto_name || t?.name || '');
          setRtoNumber(t?.rto_id || '');
        }
      });
  }, [tenantId, tenants]);

  const resetForm = () => {
    setStep(preselectedAuditType ? 2 : 1);
    setAuditType(preselectedAuditType || null);
    if (!preselectedTenantId) { setTenantId(null); setTenantName(''); }
    setTitle(''); setConductedAt(''); setLeadAuditorId(''); setAssistedById('');
    setTrainingProducts(''); setDocNumber('');
    setRtoName(''); setRtoNumber(''); setCricosCode('');
    setSiteAddress(''); setCeo(''); setPhone(''); setEmail(''); setWebsite('');
  };

  useEffect(() => { if (!open) resetForm(); }, [open]);

  const handleSave = () => {
    if (!auditType || !tenantId) return;
    createAudit.mutate({
      audit_type: auditType,
      subject_tenant_id: tenantId,
      client_name: tenantName,
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {auditTypes.map(at => {
                const Icon = at.icon;
                return (
                  <Card
                    key={at.value}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      auditType === at.value && 'ring-2 ring-primary border-primary'
                    )}
                    onClick={() => setAuditType(at.value)}
                  >
                    <CardContent className="p-6 text-center space-y-3">
                      <Icon className="h-10 w-10 mx-auto text-primary" />
                      <p className="font-semibold">{at.label}</p>
                      <p className="text-sm text-muted-foreground">{at.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
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
                          {t.name}{t.rto_id ? ` (${t.rto_id})` : ''}
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
              {auditType !== 'due_diligence' && (
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
              <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !auditType || step === 2 && !tenantId}>
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
