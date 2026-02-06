import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, ExternalLink, Shield } from "lucide-react";

interface ComplianceBillingBlockProps {
  tenantName?: string;
  showFullPage?: boolean;
}

/**
 * Displayed to Compliance System tenants when they access billing UI.
 * Compliance billing is managed externally by Vivacity (via Xero/contracts),
 * not through self-service eWay payments.
 */
export function ComplianceBillingBlock({ 
  tenantName,
  showFullPage = true 
}: ComplianceBillingBlockProps) {
  const content = (
    <Card className={showFullPage ? "max-w-lg w-full" : ""}>
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-xl">Billing Managed by Vivacity</CardTitle>
        <CardDescription>
          Your Compliance System subscription is managed directly by our team
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Info */}
        <div className="rounded-lg bg-muted/50 border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Plan</span>
            <Badge variant="default" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Compliance System
            </Badge>
          </div>
          {tenantName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Organisation</span>
              <span className="text-sm font-medium">{tenantName}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Billing Type</span>
            <span className="text-sm font-medium">Contract / Invoice</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">User Seats</span>
            <span className="text-sm font-medium">Unlimited</span>
          </div>
        </div>

        {/* Features */}
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Included Features</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Full compliance management system</li>
            <li>• Document generation & management</li>
            <li>• Resource Hub access</li>
            <li>• Vivacity Academy access</li>
            <li>• Dedicated Vivacity consultant</li>
          </ul>
        </div>

        {/* Contact Support */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
          <p className="text-sm font-medium text-primary">Need to update your subscription?</p>
          <p className="text-sm text-muted-foreground">
            For billing enquiries, plan changes, or invoice requests, please contact your 
            Vivacity consultant or our accounts team.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => window.location.href = "mailto:accounts@vivacitycoaching.com.au?subject=Billing Enquiry"}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email Accounts
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => window.location.href = "tel:+611300842224"}
            >
              <Phone className="h-4 w-4 mr-2" />
              1300 842 224
            </Button>
          </div>
        </div>

        {/* Help Link */}
        <p className="text-xs text-center text-muted-foreground">
          <a 
            href="https://support.vivacitycoaching.com.au" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            Visit our Help Centre
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );

  if (showFullPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        {content}
      </div>
    );
  }

  return content;
}
