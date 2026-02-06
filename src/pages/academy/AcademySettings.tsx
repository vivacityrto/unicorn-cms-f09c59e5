import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTenantType } from "@/contexts/TenantTypeContext";
import { PlanInfoCard } from "@/components/academy/PlanInfoCard";
import { User, CreditCard, Bell, Shield } from "lucide-react";

const AcademySettings = () => {
  const { profile } = useAuth();
  const { academyTier, tenantType } = useTenantType();
  const tenantId = profile?.tenant_id;

  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and subscription settings
          </p>
        </div>

        <Tabs defaultValue="billing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-lg">
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            {/* Current Plan */}
            {tenantId && (
              <PlanInfoCard tenantId={tenantId} showUpgradeCTA />
            )}

            {/* Billing History */}
            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>View your past invoices and payments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>No billing history available</p>
                </div>
              </CardContent>
            </Card>

            {/* Academy Benefits by Tier */}
            <Card>
              <CardHeader>
                <CardTitle>Plan Comparison</CardTitle>
                <CardDescription>See what's included in each Academy tier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Solo */}
                  <div className={`p-4 rounded-lg border ${academyTier === 'solo' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <h4 className="font-semibold mb-2">Academy Solo</h4>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li>• 1 user seat</li>
                      <li>• All courses</li>
                      <li>• Certificates</li>
                      <li>• Events access</li>
                      <li>• Community access</li>
                    </ul>
                    {academyTier === 'solo' && (
                      <span className="inline-block mt-3 text-xs font-medium text-primary">Current Plan</span>
                    )}
                  </div>

                  {/* Team */}
                  <div className={`p-4 rounded-lg border ${academyTier === 'team' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <h4 className="font-semibold mb-2">Academy Team</h4>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li>• Up to 10 user seats</li>
                      <li>• All Solo features</li>
                      <li>• Team management</li>
                      <li>• Progress tracking</li>
                      <li>• Team analytics</li>
                    </ul>
                    {academyTier === 'team' && (
                      <span className="inline-block mt-3 text-xs font-medium text-primary">Current Plan</span>
                    )}
                  </div>

                  {/* Elite */}
                  <div className={`p-4 rounded-lg border ${academyTier === 'elite' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <h4 className="font-semibold mb-2">Academy Elite</h4>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li>• Up to 30 user seats</li>
                      <li>• All Team features</li>
                      <li>• Priority support</li>
                      <li>• Custom onboarding</li>
                      <li>• Upgrade path to Compliance</li>
                    </ul>
                    {academyTier === 'elite' && (
                      <span className="inline-block mt-3 text-xs font-medium text-primary">Current Plan</span>
                    )}
                  </div>
                </div>

                {/* Compliance System CTA */}
                <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
                  <h4 className="font-semibold mb-2">Ready for Full Compliance?</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Upgrade to the Compliance System for full RTO compliance management, 
                    branded documents, resource hub access, and a dedicated Vivacity consultant.
                  </p>
                  <span className="text-xs text-muted-foreground">
                    Contact us to discuss your upgrade options.
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">First Name</label>
                      <p className="text-foreground">{profile?.first_name || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Last Name</label>
                      <p className="text-foreground">{profile?.last_name || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <p className="text-foreground">{profile?.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose what updates you receive</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Notification settings coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Security settings coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AcademyLayout>
  );
};

export default AcademySettings;
