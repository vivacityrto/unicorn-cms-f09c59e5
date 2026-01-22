import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Plus, X, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatAddressLine } from '@/utils/addressParser';
import { toast } from 'sonner';

interface TenantAddress {
  id: string;
  address_type: string;
  address1: string;
  address2: string | null;
  address3: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  full_address: string | null;
}

interface AddressType {
  code: string;
  label: string;
  description: string | null;
}

interface ClientAddressSectionProps {
  tenantId: number;
  loading?: boolean;
}

const AUSTRALIAN_STATES = [
  { value: 'NSW', label: 'NSW' },
  { value: 'VIC', label: 'VIC' },
  { value: 'QLD', label: 'QLD' },
  { value: 'WA', label: 'WA' },
  { value: 'SA', label: 'SA' },
  { value: 'TAS', label: 'TAS' },
  { value: 'NT', label: 'NT' },
  { value: 'ACT', label: 'ACT' }
];

const getAddressTypeBadgeColor = (code: string): string => {
  switch (code) {
    case 'HO':
      return 'bg-teal-500 text-white hover:bg-teal-600';
    case 'PO':
      return 'bg-purple-600 text-white hover:bg-purple-700';
    case 'DS':
      return 'bg-blue-500 text-white hover:bg-blue-600';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

interface AddressFormData {
  address_type: string;
  address1: string;
  address2: string;
  suburb: string;
  state: string;
  postcode: string;
}

const emptyForm: AddressFormData = {
  address_type: '',
  address1: '',
  address2: '',
  suburb: '',
  state: '',
  postcode: ''
};

export function ClientAddressSection({ tenantId, loading: parentLoading }: ClientAddressSectionProps) {
  const [addresses, setAddresses] = useState<TenantAddress[]>([]);
  const [addressTypes, setAddressTypes] = useState<AddressType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<AddressFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getAddressTypeLabel = (code: string) => {
    return addressTypes.find(t => t.code === code)?.label || code;
  };

  useEffect(() => {
    fetchAddressTypes();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchAddresses();
    }
  }, [tenantId]);

  const fetchAddressTypes = async () => {
    const { data, error } = await supabase
      .from('dd_address_type')
      .select('code, label, description')
      .order('code');

    if (error) {
      console.error('Error fetching address types:', error);
    } else {
      setAddressTypes(data || []);
    }
  };

  const fetchAddresses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenant_addresses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('inactive', false)
      .order('address_type');

    if (error) {
      console.error('Error fetching addresses:', error);
      toast.error('Failed to load addresses');
    } else {
      setAddresses(data || []);
    }
    setLoading(false);
  };

  const handleFormChange = (field: keyof AddressFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (address: TenantAddress) => {
    setFormData({
      address_type: address.address_type,
      address1: address.address1 || '',
      address2: address.address2 || '',
      suburb: address.suburb || '',
      state: address.state || '',
      postcode: address.postcode || ''
    });
    setEditingId(address.id);
  };

  const handleSave = async () => {
    if (!formData.address_type || !formData.address1) {
      toast.error('Type and Address Line 1 are required');
      return;
    }

    // Check for duplicate HO or PO addresses (only one allowed per tenant)
    if (['HO', 'PO'].includes(formData.address_type)) {
      const existingAddress = addresses.find(
        addr => addr.address_type === formData.address_type && addr.id !== editingId
      );
      if (existingAddress) {
        const typeLabel = formData.address_type === 'HO' ? 'Head Office' : 'Postal';
        toast.error(`Only one ${typeLabel} address is allowed per client. Please edit the existing one.`);
        return;
      }
    }

    setSaving(true);

    const addressData = {
      tenant_id: tenantId,
      address_type: formData.address_type,
      address1: formData.address1,
      address2: formData.address2 || null,
      suburb: formData.suburb || null,
      state: formData.state || null,
      postcode: formData.postcode || null,
      country: 'Australia',
      country_code: 'AU',
      inactive: false
    };

    let error;

    if (editingId) {
      // Update existing
      const { error: updateError } = await supabase
        .from('tenant_addresses')
        .update(addressData)
        .eq('id', editingId);
      error = updateError;
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('tenant_addresses')
        .insert(addressData);
      error = insertError;
    }

    if (error) {
      console.error('Error saving address:', error);
      toast.error('Failed to save address');
    } else {
      toast.success(editingId ? 'Address updated' : 'Address added');
      resetForm();
      fetchAddresses();
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('tenant_addresses')
      .update({ inactive: true })
      .eq('id', id);

    if (error) {
      console.error('Error deleting address:', error);
      toast.error('Failed to delete address');
    } else {
      toast.success('Address deleted');
      fetchAddresses();
    }
  };

  const isFormValid = formData.address_type && formData.address1;

  if (loading || parentLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Addresses</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">Addresses</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add/Edit Form */}
        <div className="border rounded-lg p-4 space-y-4">
          {/* Row 1: Type (narrow), Address Line 1 & 2 (wider) */}
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr] gap-4">
            <div className="space-y-2">
              <Label htmlFor="address_type" className="flex items-center h-5">
                Type <span className="text-destructive ml-1">*</span>
              </Label>
              <Select
                value={formData.address_type}
                onValueChange={(value) => handleFormChange('address_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {addressTypes.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address1" className="flex items-center h-5">
                Address Line 1 <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="address1"
                value={formData.address1}
                onChange={(e) => handleFormChange('address1', e.target.value)}
                placeholder=""
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address2" className="flex items-center h-5">Address Line 2</Label>
              <Input
                id="address2"
                value={formData.address2}
                onChange={(e) => handleFormChange('address2', e.target.value)}
                placeholder=""
              />
            </div>
          </div>

          {/* Row 2: Suburb (wider), State (narrow), Postcode (narrow), Add Button */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_100px_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="suburb" className="flex items-center h-5">
                Suburb <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="suburb"
                value={formData.suburb}
                onChange={(e) => handleFormChange('suburb', e.target.value)}
                placeholder="Suburb"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state" className="flex items-center h-5">
                State <span className="text-destructive ml-1">*</span>
              </Label>
              <Select
                value={formData.state}
                onValueChange={(value) => handleFormChange('state', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {AUSTRALIAN_STATES.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="postcode" className="flex items-center h-5">
                Postcode <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="postcode"
                value={formData.postcode}
                onChange={(e) => handleFormChange('postcode', e.target.value)}
                placeholder="Postcode"
                maxLength={4}
              />
            </div>

            <div className="flex gap-2">
              {editingId && (
                <Button
                  variant="outline"
                  onClick={resetForm}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!isFormValid || saving}
                className="bg-primary hover:bg-primary/90 min-w-[130px]"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Update
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Address List */}
        <div className="space-y-2">
          {addresses.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No addresses added yet
            </p>
          ) : (
            addresses.map((address) => (
              <div
                key={address.id}
                className="flex items-center justify-between border rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <Badge className={`${getAddressTypeBadgeColor(address.address_type)} shrink-0`}>
                    {getAddressTypeLabel(address.address_type)}
                  </Badge>
                  <span className="text-sm">
                    {formatAddressLine({
                      address1: address.address1,
                      address2: address.address2,
                      suburb: address.suburb,
                      state: address.state,
                      postcode: address.postcode
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(address)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(address.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
