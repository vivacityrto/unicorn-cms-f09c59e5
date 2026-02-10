import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseRBAC = vi.fn();
vi.mock("@/hooks/useRBAC", () => ({
  useRBAC: () => mockUseRBAC(),
}));

vi.mock("@/hooks/useViewMode", () => ({
  useViewMode: () => ({ isViewingAsClient: false, viewModeTenantId: null }),
}));

vi.mock("@/contexts/ViewModeContext", () => ({
  useViewMode: () => ({ isViewingAsClient: false, viewModeTenantId: null }),
}));

vi.mock("@/hooks/useAddinFeatureFlags", () => ({
  useAddinFeatureFlags: () => ({
    flags: {
      microsoft_addin_enabled: false,
      addin_outlook_mail_enabled: false,
      addin_meetings_enabled: false,
      addin_documents_enabled: false,
    },
    isLoading: false,
    isUpdating: false,
    updateFlags: vi.fn(),
    error: null,
  }),
  useIsAddinFeatureEnabled: () => false,
}));

vi.mock("@/hooks/useProfileSetupReminder", () => ({
  useProfileSetupReminder: () => ({
    showModal: false,
    setShowModal: vi.fn(),
    missingFields: [],
    handleSnooze: vi.fn(),
    handleDismiss: vi.fn(),
    logSettingsOpened: vi.fn(),
    getBestTab: () => "profile",
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ limit: () => ({ single: () => ({ data: null, error: null }) }) }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }),
    }),
  },
}));

// Stub heavy shell sub-components to avoid deep dependency chains
vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <div data-testid="topbar">TopBar</div>,
}));

vi.mock("@/components/layout/UtilityFooter", () => ({
  UtilityFooter: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock("@/components/client/ClientFooter", () => ({
  ClientFooter: () => <footer data-testid="client-footer">ClientFooter</footer>,
}));

vi.mock("@/components/ask-viv", () => ({
  AskVivPanel: () => null,
  AskVivFloatingLauncher: () => null,
}));

vi.mock("@/components/help-center", () => ({
  HelpCenterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HelpCenterDrawer: () => null,
  useHelpCenter: () => ({ openHelpCenter: vi.fn(), closeHelpCenter: vi.fn(), isOpen: false }),
}));

vi.mock("@/components/dashboard/TimeInboxWidget", () => ({
  TimeInboxBanner: () => null,
}));

vi.mock("@/components/eos/FacilitatorModeBanner", () => ({
  FacilitatorModeBanner: () => null,
}));

vi.mock("@/components/profile/ProfileSetupReminderModal", () => ({
  ProfileSetupReminderModal: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────

const superAdminProfile = {
  user_uuid: "test-uuid",
  unicorn_role: "Super Admin",
  global_role: "SuperAdmin",
  email: "admin@vivacity.com.au",
  first_name: "Test",
  last_name: "Admin",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/addin-settings"]}>
        <AddinSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Import after mocks
import AddinSettings from "@/pages/admin/AddinSettings";

// ── Tests ────────────────────────────────────────────────────────────

describe("AddinSettings shell integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      profile: superAdminProfile,
      user: { id: "test-uuid" },
      loading: false,
      isSuperAdmin: () => true,
    });

    mockUseRBAC.mockReturnValue({
      isSuperAdmin: true,
      isVivacityTeam: true,
      canAccessAdmin: true,
      canAccessAdvanced: true,
      canAccessEOS: () => true,
      canAccessRoute: () => true,
      isTeamLeader: false,
      isTeamMember: false,
    });
  });

  it("renders page content inside DashboardLayout with topbar and footer", () => {
    renderPage();

    // Page content
    expect(screen.getByText("Microsoft Add-in Settings")).toBeInTheDocument();

    // Shell elements via test IDs
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("sidebar has System Config section visible for SuperAdmin", () => {
    renderPage();

    // System Config section trigger is rendered (sections are collapsed by default)
    const systemConfigButton = screen.getByRole("button", { name: "System Config" });
    expect(systemConfigButton).toBeInTheDocument();
  });

  it("does not render duplicate topbars or footers", () => {
    renderPage();

    // Only one topbar and one footer from the shell
    expect(screen.getAllByTestId("topbar")).toHaveLength(1);
    expect(screen.getAllByTestId("footer")).toHaveLength(1);
  });

  it("page content uses standard p-6 padding", () => {
    renderPage();

    const heading = screen.getByText("Microsoft Add-in Settings");
    const contentWrapper = heading.closest(".p-6");
    expect(contentWrapper).not.toBeNull();
  });

  it("main content wrapper uses flex-col min-h-screen for footer positioning", () => {
    renderPage();

    // The DashboardLayout main content div uses min-h-screen and flex-col
    const footer = screen.getByTestId("footer");
    const mainWrapper = footer.parentElement;
    expect(mainWrapper?.className).toMatch(/min-h-screen/);
    expect(mainWrapper?.className).toMatch(/flex-col/);
  });
});
