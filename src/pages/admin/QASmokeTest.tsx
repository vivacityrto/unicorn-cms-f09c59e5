import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Target,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Settings,
  Play,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Viewport presets matching the responsive harness
const VIEWPORTS = [
  { width: 320, label: '320', icon: Smartphone },
  { width: 375, label: '375', icon: Smartphone },
  { width: 768, label: '768', icon: Tablet },
  { width: 1024, label: '1024', icon: Monitor },
  { width: 1280, label: '1280', icon: Monitor },
  { width: null, label: 'Full', icon: Monitor },
] as const;

// Screen definitions for smoke testing
const SCREENS = {
  core: [
    { path: '/', label: 'Dashboard / Work', icon: LayoutDashboard, roles: ['all'] },
    { path: '/settings/profile', label: 'Profile Settings', icon: Settings, roles: ['all'] },
  ],
  admin: [
    { path: '/admin/users', label: 'Manage Users', icon: Users, roles: ['SuperAdmin', 'TeamLeader'] },
    { path: '/admin/tenants', label: 'Manage Tenants', icon: Building2, roles: ['SuperAdmin'] },
  ],
  documents: [
    { path: '/documents', label: 'Documents Portal', icon: FileText, roles: ['all'] },
  ],
  eos: [
    { path: '/eos', label: 'EOS Overview', icon: Target, roles: ['VivacityTeam'] },
    { path: '/eos/meetings', label: 'EOS Meetings', icon: Calendar, roles: ['VivacityTeam'] },
    { path: '/eos/rocks', label: 'EOS Rocks', icon: Target, roles: ['VivacityTeam'] },
    { path: '/eos/todos', label: 'EOS To-Dos', icon: CheckSquare, roles: ['VivacityTeam'] },
    { path: '/eos/issues', label: 'EOS Issues', icon: AlertTriangle, roles: ['VivacityTeam'] },
  ],
};

export default function QASmokeTest() {
  const navigate = useNavigate();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { user: authUser, profile } = useAuth();
  const [selectedViewport, setSelectedViewport] = useState<number | null>(null);

  // Redirect if not authorized
  if (!isSuperAdmin && !isVivacityTeam) {
    navigate('/');
    return null;
  }

  // Get display role from profile
  const displayRole = profile?.unicorn_role || (isSuperAdmin ? 'Super Admin' : 'Unknown');

  // Check if user can access a screen
  const canAccessScreen = (screenRoles: string[]) => {
    if (screenRoles.includes('all')) return true;
    if (screenRoles.includes('SuperAdmin') && isSuperAdmin) return true;
    if (screenRoles.includes('TeamLeader') && (profile?.unicorn_role === 'Team Leader' || isSuperAdmin)) return true;
    if (screenRoles.includes('VivacityTeam') && isVivacityTeam) return true;
    return false;
  };

  // Open screen in new tab with viewport simulation
  const openScreen = (path: string) => {
    if (selectedViewport) {
      // Open in current window with resized viewport hint
      // Note: Can't actually resize browser, but can navigate
      window.open(path, '_blank', `width=${selectedViewport},height=800`);
    } else {
      window.open(path, '_blank');
    }
  };

  const ScreenLink = ({ screen }: { screen: typeof SCREENS.core[0] }) => {
    const accessible = canAccessScreen(screen.roles);
    const Icon = screen.icon;

    return (
      <div
        className={cn(
          "flex items-center justify-between p-3 rounded-lg border transition-colors",
          accessible 
            ? "hover:bg-muted/50 cursor-pointer" 
            : "opacity-50 cursor-not-allowed bg-muted/20"
        )}
        onClick={() => accessible && openScreen(screen.path)}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{screen.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {screen.path}
          </Badge>
          {accessible ? (
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Info className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <PageHeader
          title="QA Smoke Test"
          description="Quick links to test screens across roles and viewports"
        />

        {/* Current Context */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current Context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Role:</span>
                <Badge variant="secondary" className="font-medium">
                  {displayRole}
                </Badge>
              </div>
              <Separator orientation="vertical" className="h-6 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">User:</span>
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {authUser?.email || 'Unknown'}
                </span>
              </div>
              <Separator orientation="vertical" className="h-6 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Viewport:</span>
                <span className="text-sm font-mono">
                  {typeof window !== 'undefined' ? `${window.innerWidth}px` : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Viewport Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Target Viewport</CardTitle>
            <CardDescription>
              Links will open in new window with specified width (browser dependent)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {VIEWPORTS.map(({ width, label, icon: Icon }) => (
                <Button
                  key={label}
                  variant={selectedViewport === width ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedViewport(width)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Screen Links */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Core Screens */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Core Screens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SCREENS.core.map((screen) => (
                <ScreenLink key={screen.path} screen={screen} />
              ))}
            </CardContent>
          </Card>

          {/* Admin Screens */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Admin Screens
              </CardTitle>
              <CardDescription className="text-xs">
                SuperAdmin / Team Leader only
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SCREENS.admin.map((screen) => (
                <ScreenLink key={screen.path} screen={screen} />
              ))}
            </CardContent>
          </Card>

          {/* Document Screens */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SCREENS.documents.map((screen) => (
                <ScreenLink key={screen.path} screen={screen} />
              ))}
            </CardContent>
          </Card>

          {/* EOS Screens */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                EOS Modules
              </CardTitle>
              <CardDescription className="text-xs">
                Vivacity Team only
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SCREENS.eos.map((screen) => (
                <ScreenLink key={screen.path} screen={screen} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/qa/responsive">Open Responsive Harness</Link>
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Trigger dev warning check manually
                  if (document.body.scrollWidth > window.innerWidth) {
                    console.warn('[QA] Horizontal overflow detected!', {
                      scrollWidth: document.body.scrollWidth,
                      innerWidth: window.innerWidth,
                      overflow: document.body.scrollWidth - window.innerWidth,
                    });
                    alert(`Horizontal overflow: ${document.body.scrollWidth - window.innerWidth}px`);
                  } else {
                    alert('No horizontal overflow detected ✓');
                  }
                }}
              >
                Check Overflow Now
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const verbose = localStorage.getItem('QA_VERBOSE') === 'true';
                  localStorage.setItem('QA_VERBOSE', String(!verbose));
                  alert(`Verbose logging ${!verbose ? 'enabled' : 'disabled'}`);
                }}
              >
                Toggle Verbose Logging
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ol className="list-decimal list-inside space-y-1">
              <li>Note your current role badge above</li>
              <li>Select a target viewport width</li>
              <li>Click screen links to open in new window</li>
              <li>At each screen: check layout, open modals, verify no clipping</li>
              <li>Use "Check Overflow Now" to detect horizontal scroll issues</li>
            </ol>
            <p className="pt-2">
              See <code className="bg-muted px-1 rounded">docs/ui-smoke-tests.md</code> for the full test matrix.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
