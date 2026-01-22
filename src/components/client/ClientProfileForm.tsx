import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Save, ExternalLink } from 'lucide-react';
import { ClientProfile } from '@/hooks/useClientManagement';

interface ClientProfileFormProps {
  profile: ClientProfile | null;
  onSave: (updates: Partial<ClientProfile>) => Promise<boolean>;
  loading?: boolean;
  tgaLinked?: boolean;
}

const ORG_TYPES = [
  { value: 'rto', label: 'RTO' },
  { value: 'cricos', label: 'CRICOS Provider' },
  { value: 'gto', label: 'GTO' },
  { value: 'rto_cricos', label: 'RTO + CRICOS' },
  { value: 'other', label: 'Other' }
];

const STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'ACT', label: 'Australian Capital Territory' }
];

const RISK_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
];

const LMS_OPTIONS = [
  { value: 'moodle', label: 'Moodle' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'blackboard', label: 'Blackboard' },
  { value: 'axcelerate', label: 'aXcelerate' },
  { value: 'totara', label: 'Totara' },
  { value: 'other', label: 'Other' }
];

const SMS_OPTIONS = [
  { value: 'axcelerate', label: 'aXcelerate' },
  { value: 'wisenet', label: 'Wisenet' },
  { value: 'vettrak', label: 'VETtrak' },
  { value: 'jobready', label: 'Jobready' },
  { value: 'rtomanager', label: 'RTO Manager' },
  { value: 'cloud_assess', label: 'Cloud Assess' },
  { value: 'other', label: 'Other' }
];

const ACCOUNTING_OPTIONS = [
  { value: 'xero', label: 'Xero' },
  { value: 'myob', label: 'MYOB' },
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'sage', label: 'Sage' },
  { value: 'other', label: 'Other' }
];

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

export function ClientProfileForm({ profile, onSave, loading, tgaLinked }: ClientProfileFormProps) {
  const [formData, setFormData] = useState<Partial<ClientProfile>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
      setHasChanges(false);
    }
  }, [profile]);

  const handleChange = (field: keyof ClientProfile, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave(formData);
    setSaving(false);
    if (success) {
      setHasChanges(false);
    }
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
          {/* Legal Name - spans full width */}
          <div className="space-y-2 md:col-span-3">
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

          {/* Row 2: Trading Name, Org Type, Risk Level */}
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
            <Label htmlFor="org_type" className="flex items-center">
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
              <SelectContent>
                {ORG_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk_level">Risk Level</Label>
            <Select
              value={formData.risk_level || ''}
              onValueChange={(value) => handleChange('risk_level', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select risk..." />
              </SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 3: ABN, ACN, Website */}
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

          {/* Row 4: RTO Number, CRICOS Code, State */}
          <div className="space-y-2">
            <Label htmlFor="rto_number">RTO Number</Label>
            <Input
              id="rto_number"
              value={formData.rto_number || ''}
              onChange={(e) => handleChange('rto_number', e.target.value)}
              placeholder="e.g. 12345"
              disabled={loading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cricos_number">CRICOS Provider Code</Label>
            <Input
              id="cricos_number"
              value={formData.cricos_number || ''}
              onChange={(e) => handleChange('cricos_number', e.target.value)}
              placeholder="e.g. 01234A"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Select
              value={formData.state || ''}
              onValueChange={(value) => handleChange('state', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state..." />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((state) => (
                  <SelectItem key={state.value} value={state.value}>
                    {state.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 5: SMS, LMS, Accounting System */}
          <div className="space-y-2">
            <Label htmlFor="sms">Student Management System</Label>
            <Select
              value={formData.sms || ''}
              onValueChange={(value) => handleChange('sms', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select SMS..." />
              </SelectTrigger>
              <SelectContent>
                {SMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lms">Learning Management System</Label>
            <Select
              value={formData.lms || ''}
              onValueChange={(value) => handleChange('lms', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select LMS..." />
              </SelectTrigger>
              <SelectContent>
                {LMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accounting_system">Accounting System</Label>
            <Select
              value={formData.accounting_system || ''}
              onValueChange={(value) => handleChange('accounting_system', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select system..." />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNTING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving || loading}
          className="min-w-[120px]"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
