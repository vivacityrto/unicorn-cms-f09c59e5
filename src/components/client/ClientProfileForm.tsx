import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatableSelect } from '@/components/ui/CreatableSelect';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { ClientProfile } from '@/hooks/useClientManagement';
import { supabase } from '@/integrations/supabase/client';

interface ClientProfileFormProps {
  profile: ClientProfile | null;
  onSave: (updates: Partial<ClientProfile>) => Promise<boolean>;
  loading?: boolean;
  tgaLinked?: boolean;
  onStateChange?: (hasChanges: boolean, saving: boolean, triggerSave: () => void) => void;
}

interface LookupOption {
  value: string;
  label: string;
}

function useLookupTable(tableName: string) {
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from(tableName as any)
        .select('value, label')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setOptions((data as any[]).map(d => ({ value: d.value, label: d.label })));
    };
    fetch();
  }, [tableName, refreshKey]);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { options, refresh };
}

// Fields that are synced from TGA when linked
const TGA_SYNCED_FIELDS = ['legal_name', 'trading_name', 'abn', 'acn', 'website', 'org_type'] as const;

function TgaBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="ml-2 text-xs bg-primary/5 text-primary border-primary/20">
            <ExternalLink className="h-3 w-3 mr-1" />
            TGA
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>This field is synced from training.gov.au</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ClientProfileForm({ profile, onSave, loading, tgaLinked, onStateChange }: ClientProfileFormProps) {
  const [formData, setFormData] = useState<Partial<ClientProfile>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const { options: ORG_TYPES } = useLookupTable('dd_org_type');
  const { options: SMS_OPTIONS, refresh: refreshSms } = useLookupTable('dd_sms');
  const { options: LMS_OPTIONS, refresh: refreshLms } = useLookupTable('dd_lms');
  const { options: ACCOUNTING_OPTIONS, refresh: refreshAccounting } = useLookupTable('dd_accounting_system');

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave(formData);
    setSaving(false);
    if (success) {
      setHasChanges(false);
    }
  };

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(hasChanges, saving, handleSave);
    }
  }, [hasChanges, saving, onStateChange]);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
      setHasChanges(false);
    }
  }, [profile]);

  const handleChange = (field: keyof ClientProfile, value: string | null) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-set org_type based on RTO Number and CRICOS Code
      // Only if org_type is not already set by user
      if ((field === 'rto_number' || field === 'cricos_number') && !prev.org_type) {
        const rtoNumber = field === 'rto_number' ? value : prev.rto_number;
        const cricosNumber = field === 'cricos_number' ? value : prev.cricos_number;
        
        const hasRto = rtoNumber && rtoNumber.trim() !== '';
        const hasCricos = cricosNumber && cricosNumber.trim() !== '';
        
        if (hasRto && hasCricos) {
          updated.org_type = 'rto_cricos';
        } else if (hasRto) {
          updated.org_type = 'rto';
        } else if (hasCricos) {
          updated.org_type = 'cricos';
        }
      }
      
      return updated;
    });
    setHasChanges(true);
  };

  // Check if a field is synced from TGA and should be read-only
  const isTgaField = (field: string) => {
    return tgaLinked && TGA_SYNCED_FIELDS.includes(field as any);
  };

  return (
    <div className="space-y-6">
      {/* Organisation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organisation Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Row 1: RTO Number, CRICOS Code, Organisation Type */}
          <div className="space-y-2">
            <Label htmlFor="rto_number" className="flex items-center h-5">RTO Number</Label>
            <Input
              id="rto_number"
              value={formData.rto_number || ''}
              onChange={(e) => handleChange('rto_number', e.target.value)}
              placeholder="e.g. 12345"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cricos_number" className="flex items-center gap-1.5">
              <span>CRICOS Provider Code</span>
              {formData.cricos_number?.trim() && !['tbc', 'tba', 'na', 'n/a'].includes(formData.cricos_number.trim().toLowerCase()) && (
                <a
                  href={`https://cricos.education.gov.au/Institution/InstitutionDetails.aspx?ProviderCode=${encodeURIComponent(formData.cricos_number.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-primary hover:text-primary/80"
                  title="View on CRICOS register"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </Label>
            <Input
              id="cricos_number"
              value={formData.cricos_number || ''}
              onChange={(e) => handleChange('cricos_number', e.target.value)}
              placeholder="e.g. 01234A"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org_type" className="flex items-center h-5">
              Organisation Type
              {isTgaField('org_type') && <TgaBadge />}
            </Label>
            <Select
              value={formData.org_type || ''}
              onValueChange={(value) => handleChange('org_type', value)}
              disabled={loading || isTgaField('org_type')}
            >
              <SelectTrigger className={isTgaField('org_type') ? 'bg-muted' : ''}>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {ORG_TYPES.filter(t => t.value).map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: Legal Name, Trading Name, RTO Name */}
          <div className="space-y-2">
            <Label htmlFor="legal_name" className="flex items-center">
              Legal Name
              {isTgaField('legal_name') && <TgaBadge />}
            </Label>
            <Input
              id="legal_name"
              value={formData.legal_name || ''}
              onChange={(e) => handleChange('legal_name', e.target.value)}
              disabled={loading || isTgaField('legal_name')}
              placeholder={isTgaField('legal_name') && !formData.legal_name ? 'Not provided by TGA' : ''}
              className={isTgaField('legal_name') ? 'bg-muted' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trading_name" className="flex items-center">
              Trading Name
              {isTgaField('trading_name') && <TgaBadge />}
            </Label>
            <Input
              id="trading_name"
              value={formData.trading_name || ''}
              onChange={(e) => handleChange('trading_name', e.target.value)}
              disabled={loading || isTgaField('trading_name')}
              placeholder={isTgaField('trading_name') && !formData.trading_name ? 'Not provided by TGA' : ''}
              className={isTgaField('trading_name') ? 'bg-muted' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website" className="flex items-center">
              Website
              {isTgaField('website') && <TgaBadge />}
            </Label>
            <Input
              id="website"
              value={formData.website || ''}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder={isTgaField('website') && !formData.website ? 'Not provided by TGA' : 'https://...'}
              disabled={loading || isTgaField('website')}
              className={isTgaField('website') ? 'bg-muted' : ''}
            />
          </div>

          {/* Row 3: ABN, ACN, (empty) */}
          <div className="space-y-2">
            <Label htmlFor="abn" className="flex items-center">
              ABN
              {isTgaField('abn') && <TgaBadge />}
            </Label>
            <Input
              id="abn"
              value={formData.abn || ''}
              onChange={(e) => handleChange('abn', e.target.value)}
              placeholder={isTgaField('abn') && !formData.abn ? 'Not provided by TGA' : 'XX XXX XXX XXX'}
              disabled={loading || isTgaField('abn')}
              className={isTgaField('abn') ? 'bg-muted' : ''}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="acn" className="flex items-center">
              ACN
              {isTgaField('acn') && <TgaBadge />}
            </Label>
            <Input
              id="acn"
              value={formData.acn || ''}
              onChange={(e) => handleChange('acn', e.target.value)}
              placeholder={isTgaField('acn') && !formData.acn ? 'Not provided by TGA' : 'XXX XXX XXX'}
              disabled={loading || isTgaField('acn')}
              className={isTgaField('acn') ? 'bg-muted' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone1">Phone</Label>
            <Input
              id="phone1"
              value={formData.phone1 || ''}
              onChange={(e) => handleChange('phone1', e.target.value)}
              placeholder="e.g. +61 8 1234 5678"
              disabled={loading}
            />
          </div>

          {/* Row 4: SMS, LMS, Accounting System */}
          <div className="space-y-2">
            <Label htmlFor="sms">Student Management System</Label>
            <CreatableSelect
              tableName="dd_sms"
              options={SMS_OPTIONS}
              value={formData.sms || ''}
              onValueChange={(value) => handleChange('sms', value)}
              onOptionCreated={refreshSms}
              placeholder="Select SMS..."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lms">Learning Management System</Label>
            <CreatableSelect
              tableName="dd_lms"
              options={LMS_OPTIONS}
              value={formData.lms || ''}
              onValueChange={(value) => handleChange('lms', value)}
              onOptionCreated={refreshLms}
              placeholder="Select LMS..."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accounting_system">Accounting System</Label>
            <CreatableSelect
              tableName="dd_accounting_system"
              options={ACCOUNTING_OPTIONS}
              value={formData.accounting_system || ''}
              onValueChange={(value) => handleChange('accounting_system', value)}
              onOptionCreated={refreshAccounting}
              placeholder="Select system..."
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
