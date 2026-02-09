import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRBAC } from '@/hooks/useRBAC';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ResponsiveTableShell,
  ResponsiveListCard,
  ResponsiveListCards,
  columnVisibility,
} from '@/components/ui/responsive-table';
import {
  FormSection,
  FieldRow,
  FieldGroup,
  FormGrid,
  FormActions,
  FieldHint,
  FieldError,
} from '@/components/ui/form-primitives';
import { Text, TruncatedText, CopyableId, textUtils } from '@/components/ui/text';
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
  AppDrawer,
  AppDrawerContent,
  AppDrawerHeader,
  AppDrawerTitle,
  AppDrawerDescription,
  AppDrawerBody,
  AppDrawerFooter,
  ConfirmDialog,
  FormModal,
  FormModalSection,
  FormModalRow,
} from '@/components/ui/modals';
import {
  Monitor,
  Smartphone,
  Tablet,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Breakpoint presets
const BREAKPOINTS = [
  { label: '320', width: 320, icon: Smartphone },
  { label: '375', width: 375, icon: Smartphone },
  { label: '640', width: 640, icon: Tablet },
  { label: '768', width: 768, icon: Tablet },
  { label: '1024', width: 1024, icon: Monitor },
  { label: '1280', width: 1280, icon: Monitor },
  { label: 'Full', width: null, icon: Maximize2 },
] as const;

// Mock data for worst-case testing
const MOCK_DATA = {
  longName: 'Dr. Alexandria Bartholomew-Smithington III',
  longEmail: 'very.long.email.address.for.testing.purposes@subdomain.example-domain.com.au',
  longTenant: 'Australian Vocational Education and Training Institute of Excellence Pty Ltd',
  longStatus: 'Pending Approval from Compliance Officer',
  longDescription: 'This is an extremely long description that spans multiple lines and tests text wrapping behaviour across different breakpoints to ensure content remains readable without causing horizontal scroll issues.',
  users: [
    { id: '1', name: 'Dr. Alexandria Bartholomew-Smithington III', email: 'very.long.email.address@subdomain.example-domain.com.au', tenant: 'Australian Vocational Education and Training Institute of Excellence Pty Ltd', role: 'Super Admin', status: 'Active', phone: '+61 400 000 000' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', tenant: 'Short RTO', role: 'Team Member', status: 'Pending Approval from Compliance Officer', phone: '+61 400 111 111' },
    { id: '3', name: 'Bob Johnson', email: 'bob.johnson.longname@verylongdomainname.com.au', tenant: 'Training Provider ABC', role: 'Admin', status: 'Active', phone: '+61 400 222 222' },
  ],
};

export default function QAResponsiveHarness() {
  const navigate = useNavigate();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const [selectedWidth, setSelectedWidth] = useState<number | null>(null);
  const [showOverflowWarning, setShowOverflowWarning] = useState(false);
  const [overflowDetails, setOverflowDetails] = useState({ scrollWidth: 0, innerWidth: 0 });
  
  // Modal/Drawer states
  const [showAppModal, setShowAppModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAppDrawer, setShowAppDrawer] = useState(false);

  // Authorization check
  const isAuthorized = isSuperAdmin || isVivacityTeam;

  // Overflow detection
  useEffect(() => {
    const checkOverflow = () => {
      const hasOverflow = document.body.scrollWidth > window.innerWidth;
      setShowOverflowWarning(hasOverflow);
      if (hasOverflow) {
        setOverflowDetails({
          scrollWidth: document.body.scrollWidth,
          innerWidth: window.innerWidth,
        });
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    const observer = new MutationObserver(checkOverflow);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', checkOverflow);
      observer.disconnect();
    };
  }, []);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">This page is only accessible to SuperAdmin and Vivacity Team members.</p>
            <Button onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const previewWidth = selectedWidth ? `${selectedWidth}px` : '100%';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Overflow Warning Banner */}
      {showOverflowWarning && (
        <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            Page overflow detected! scrollWidth: {overflowDetails.scrollWidth}px, innerWidth: {overflowDetails.innerWidth}px
          </span>
        </div>
      )}

      {/* Control Bar */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground">QA Responsive Harness</h1>
          
          <div className="flex items-center gap-1 flex-wrap">
            {BREAKPOINTS.map((bp) => {
              const Icon = bp.icon;
              const isActive = bp.width === selectedWidth || (bp.width === null && selectedWidth === null);
              return (
                <Button
                  key={bp.label}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedWidth(bp.width)}
                  className="gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{bp.label}</span>
                  <span className="sm:hidden">{bp.label}</span>
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!showOverflowWarning && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                No overflow
              </Badge>
            )}
            <Badge variant="secondary">
              {selectedWidth ? `${selectedWidth}px` : 'Full width'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Preview Container */}
      <div className="p-4 md:p-6 flex justify-center">
        <div
          className={cn(
            "bg-background border-2 border-dashed border-primary/30 rounded-lg overflow-hidden transition-all duration-300",
            selectedWidth && "shadow-lg"
          )}
          style={{ width: previewWidth, maxWidth: '100%' }}
        >
          <div className="p-4 md:p-6 space-y-8">
            
            {/* Section 1: Page Header + Actions */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Page Header + Actions</h2>
              <PageHeader
                title="Manage Users"
                description="View and manage all users across your organisation including team members and client users."
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-1" />
                      Filter
                    </Button>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add User
                    </Button>
                  </div>
                }
              />
            </section>

            {/* Section 2: Filters Row + Search */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Filters Row + Search</h2>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by name or email..." className="pl-9 w-full" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending Approval from Compliance Officer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="superadmin">Super Admin</SelectItem>
                      <SelectItem value="teamlead">Team Leader</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Section 3: Standardized Form Primitives */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Standardized Form (Form Primitives)</h2>
              <Card>
                <CardContent className="pt-6">
                  <FormSection title="Personal Information" description="Enter your contact details" first>
                    <FieldRow>
                      <FieldGroup label="First Name" htmlFor="fname" required>
                        <Input id="fname" defaultValue="Alexandria" />
                      </FieldGroup>
                      <FieldGroup 
                        label="Last Name (Including Suffixes and Honorifics)" 
                        htmlFor="lname" 
                        required
                        hint="Include any titles or suffixes"
                      >
                        <Input id="lname" defaultValue="Bartholomew-Smithington III" />
                      </FieldGroup>
                    </FieldRow>
                  </FormSection>

                  <FormSection title="Contact Details">
                    <FieldGroup 
                      label="Email Address (Primary Contact for All Communications)" 
                      htmlFor="email"
                      required
                      hint="We'll use this for all account notifications and correspondence"
                      error=""
                    >
                      <Input id="email" type="email" defaultValue={MOCK_DATA.longEmail} />
                    </FieldGroup>

                    <FieldGroup 
                      label="Organisation / Tenant (Registered Training Organisation Name)" 
                      htmlFor="org"
                      hint="The full legal name of the organisation"
                    >
                      <Input id="org" defaultValue={MOCK_DATA.longTenant} />
                    </FieldGroup>
                  </FormSection>

                  <FormSection title="Additional Information">
                    <FieldGroup 
                      label="Notes" 
                      htmlFor="notes"
                      hint="Any additional information (max 500 characters)"
                    >
                      <Textarea id="notes" defaultValue={MOCK_DATA.longDescription} rows={3} />
                    </FieldGroup>

                    <div className="flex items-start gap-2">
                      <Checkbox id="consent" />
                      <Label htmlFor="consent" className="text-sm leading-relaxed whitespace-normal">
                        I acknowledge that this user will receive access to compliance documentation and training materials as per their assigned role and permissions.
                      </Label>
                    </div>
                  </FormSection>

                  {/* Validation Examples */}
                  <FormSection title="Validation States">
                    <FieldRow>
                      <FieldGroup 
                        label="Field with Error" 
                        htmlFor="error-field"
                        required
                        error="This field is required and must be at least 10 characters long to meet the validation requirements"
                      >
                        <Input id="error-field" className="border-destructive" defaultValue="" />
                      </FieldGroup>
                      <FieldGroup 
                        label="Field with Long Hint" 
                        htmlFor="hint-field"
                        hint="This is a very long hint that explains exactly what this field is for and provides additional context about the expected input format and any validation rules that apply"
                      >
                        <Input id="hint-field" defaultValue="Valid input" />
                      </FieldGroup>
                    </FieldRow>
                  </FormSection>

                  <FormActions>
                    <Button variant="outline" type="button">Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                  </FormActions>
                </CardContent>
              </Card>
            </section>

            {/* Section 4: Table with ResponsiveTableShell */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Table (ResponsiveTableShell)</h2>
              
              {/* Mobile Cards */}
              <div className="md:hidden">
                <ResponsiveListCards>
                  {MOCK_DATA.users.map((user) => (
                    <ResponsiveListCard
                      key={user.id}
                      title={user.name}
                      subtitle={user.email}
                      status={
                        <Badge variant={user.status === 'Active' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                      }
                      fields={[
                        { label: 'Role', value: <Badge variant="outline">{user.role}</Badge>, priority: 'primary' },
                        { label: 'Tenant', value: user.tenant, priority: 'secondary' },
                        { label: 'Phone', value: user.phone, priority: 'secondary' },
                      ]}
                      actions={[
                        { label: 'Edit', icon: <Edit className="h-4 w-4" />, onClick: () => {} },
                        { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => {}, variant: 'destructive' },
                      ]}
                    />
                  ))}
                </ResponsiveListCards>
              </div>

              {/* Desktop Table */}
              <ResponsiveTableShell className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className={columnVisibility.lg}>Email</TableHead>
                      <TableHead className={columnVisibility.xl}>Tenant</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_DATA.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium break-words max-w-[200px]">{user.name}</TableCell>
                        <TableCell className={cn("break-all max-w-[250px]", columnVisibility.lg)}>{user.email}</TableCell>
                        <TableCell className={cn("truncate max-w-[200px]", columnVisibility.xl)}>{user.tenant}</TableCell>
                        <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'Active' ? 'default' : 'secondary'} className="whitespace-normal text-xs">
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTableShell>
            </section>

            {/* Section 5: Modal/Drawer Launchers */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Modal & Drawer Test Launchers</h2>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowAppModal(true)}>AppModal</Button>
                <Button onClick={() => setShowFormModal(true)}>FormModal</Button>
                <Button variant="destructive" onClick={() => setShowConfirmDialog(true)}>ConfirmDialog</Button>
                <Button variant="outline" onClick={() => setShowAppDrawer(true)}>AppDrawer</Button>
              </div>
            </section>

            {/* Section 6: Text Overflow Tests */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Text Overflow Components</h2>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {/* Text Component Modes */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Text (wrap - default)</Label>
                      <div className="p-2 border rounded bg-muted/30">
                        <Text as="p">{MOCK_DATA.longDescription}</Text>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">TruncatedText (with tooltip)</Label>
                      <div className="p-2 border rounded bg-muted/30">
                        <TruncatedText maxWidth="max-w-full">{MOCK_DATA.longDescription}</TruncatedText>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">TruncatedText lines=2</Label>
                      <div className="p-2 border rounded bg-muted/30">
                        <TruncatedText lines={2}>{MOCK_DATA.longDescription}</TruncatedText>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">CopyableId (mono + copy)</Label>
                      <div className="p-2 border rounded bg-muted/30">
                        <CopyableId>abc123-def456-ghi789-jkl012-mno345-pqr678</CopyableId>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Long Email with Copy</Label>
                    <div className="p-2 border rounded bg-muted/30">
                      <Text overflow="truncate" copyable className="max-w-full">{MOCK_DATA.longEmail}</Text>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 7: Torture Block */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Torture Block (Overflow Tests)</h2>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {/* Unbroken strings */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Long Unbroken String</Label>
                    <p className="text-sm break-all">
                      Thisisaverylongstringwithnospacesthatshouldbreakonsmallscreensandnotcausehorizontalscrollissueswhendisplayedintheuserinterface
                    </p>
                  </div>

                  {/* Long URL */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Long URL</Label>
                    <Text overflow="mono" as="p" className="text-primary">
                      https://www.example-domain.com.au/very/long/path/to/some/resource/that/might/cause/overflow/issues/in/narrow/viewports?param1=value1&param2=value2&param3=value3
                    </Text>
                  </div>

                  {/* Bullet list */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Bullet List</Label>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                      <li>Short item</li>
                      <li>This is a medium length item that wraps</li>
                      <li className="whitespace-normal break-words">This is an extremely long list item that should wrap properly across multiple lines without causing horizontal scroll issues on any screen size</li>
                      <li className="whitespace-normal break-words">{MOCK_DATA.longTenant}</li>
                    </ul>
                  </div>

                  {/* Inline buttons */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Inline Buttons (Wrap Test)</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Button size="sm">Save</Button>
                      <Button size="sm" variant="outline">Cancel</Button>
                      <Button size="sm" variant="secondary">Save as Draft</Button>
                      <Button size="sm" variant="ghost">Reset Form</Button>
                      <Button size="sm" variant="destructive">Delete Everything</Button>
                    </div>
                  </div>

                  {/* Tags/Chips with truncation */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Tags/Chips Wrap Test</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="secondary">RTO</Badge>
                      <Badge variant="secondary">CRICOS</Badge>
                      <Badge variant="secondary">GTO</Badge>
                      <Badge variant="secondary">Compliance</Badge>
                      <Badge variant="secondary">Training</Badge>
                      <Badge variant="secondary">Assessment</Badge>
                      <Badge variant="secondary" className="max-w-[200px] truncate" title="Vocational Education and Training">Vocational Education and Training</Badge>
                      <Badge variant="secondary" className="max-w-[200px] truncate" title="Australian Skills Quality Authority">Australian Skills Quality Authority</Badge>
                      <Badge variant="secondary" className="max-w-[180px] truncate" title={MOCK_DATA.longStatus}>{MOCK_DATA.longStatus}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

          </div>
        </div>
      </div>

      {/* AppModal Test */}
      <AppModal open={showAppModal} onOpenChange={setShowAppModal}>
        <AppModalContent>
          <AppModalHeader>
            <AppModalTitle>Standard AppModal Test</AppModalTitle>
            <AppModalDescription>
              This modal tests sticky header, body scroll, focus trap, and ESC close.
            </AppModalDescription>
          </AppModalHeader>
          <AppModalBody>
            <div className="space-y-4">
              <p>{MOCK_DATA.longDescription}</p>
              <p>{MOCK_DATA.longDescription}</p>
              <p>{MOCK_DATA.longDescription}</p>
              <p>{MOCK_DATA.longDescription}</p>
              <p>{MOCK_DATA.longDescription}</p>
              <div className="space-y-2">
                <Label>Test Input</Label>
                <Input placeholder="Focus should be trapped in this modal" />
              </div>
              <p>{MOCK_DATA.longDescription}</p>
              <p>{MOCK_DATA.longDescription}</p>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setShowAppModal(false)}>Cancel</Button>
            <Button onClick={() => setShowAppModal(false)}>Confirm</Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>

      {/* FormModal Test */}
      <FormModal
        open={showFormModal}
        onOpenChange={setShowFormModal}
        title="Form Modal with Long Content"
        description="This form modal tests form layout, scrolling, and field visibility."
        onSubmit={() => setShowFormModal(false)}
        submitText="Save Changes"
      >
        <FormModalSection title="Personal Information">
          <FormModalRow>
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input defaultValue="Alexandria" />
            </div>
            <div className="space-y-2">
              <Label>Last Name (Including All Suffixes)</Label>
              <Input defaultValue="Bartholomew-Smithington III" />
            </div>
          </FormModalRow>
          <div className="space-y-2">
            <Label>Email Address (Primary Contact for Communications)</Label>
            <Input defaultValue={MOCK_DATA.longEmail} />
          </div>
        </FormModalSection>
        <FormModalSection title="Organisation Details">
          <div className="space-y-2">
            <Label>Organisation Name</Label>
            <Input defaultValue={MOCK_DATA.longTenant} />
          </div>
          <div className="space-y-2">
            <Label>Additional Notes and Comments</Label>
            <Textarea defaultValue={MOCK_DATA.longDescription} rows={4} />
          </div>
        </FormModalSection>
        <FormModalSection title="More Content for Scroll Test">
          <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
          <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
          <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
        </FormModalSection>
      </FormModal>

      {/* ConfirmDialog Test */}
      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Confirm Deletion of User Account"
        description={`Are you sure you want to permanently delete the account for "${MOCK_DATA.longName}"? This action cannot be undone and will remove all associated data including their organisation "${MOCK_DATA.longTenant}".`}
        onConfirm={() => setShowConfirmDialog(false)}
        variant="destructive"
        confirmText="Delete Account"
      />

      {/* AppDrawer Test */}
      <AppDrawer open={showAppDrawer} onOpenChange={setShowAppDrawer}>
        <AppDrawerContent>
          <AppDrawerHeader>
            <AppDrawerTitle>AppDrawer with Long Content</AppDrawerTitle>
            <AppDrawerDescription>
              This drawer tests slide-in animation, internal scrolling, and close behaviour.
            </AppDrawerDescription>
          </AppDrawerHeader>
          <AppDrawerBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>User Name</Label>
                <Input defaultValue={MOCK_DATA.longName} />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input defaultValue={MOCK_DATA.longEmail} />
              </div>
              <div className="space-y-2">
                <Label>Organisation</Label>
                <Input defaultValue={MOCK_DATA.longTenant} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea defaultValue={MOCK_DATA.longDescription} rows={4} />
              </div>
              <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
              <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
              <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
              <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
              <p className="text-sm text-muted-foreground">{MOCK_DATA.longDescription}</p>
            </div>
          </AppDrawerBody>
          <AppDrawerFooter>
            <Button variant="outline" onClick={() => setShowAppDrawer(false)}>Cancel</Button>
            <Button onClick={() => setShowAppDrawer(false)}>Save Changes</Button>
          </AppDrawerFooter>
        </AppDrawerContent>
      </AppDrawer>
    </div>
  );
}
