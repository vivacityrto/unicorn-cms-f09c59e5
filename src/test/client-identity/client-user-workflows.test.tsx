/* @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => {
  const clientRow = {
    row_type: "active" as const,
    row_key: "user:ghost-user",
    tenant_id: 42,
    user_id: "ghost-user",
    first_name: "Ghost",
    last_name: "User",
    display_name: "Ghost User",
    email: "ghost@example.com",
    avatar_url: null,
    relationship_role: "primary_contact" as const,
    primary_contact: true,
    secondary_contact: false,
    access_scope: "full",
    last_sign_in_at: null,
    last_active_at: null,
    invited_at: null,
    invite_expires_at: null,
    status: "active" as const,
    member_since: "2026-01-01T00:00:00Z",
    last_sent_at: null,
    mailgun_message_id: null,
  };

  const member = (userId: string, firstName: string, relationshipRole: "primary_contact" | "user") => ({
    user_id: userId,
    role: relationshipRole === "primary_contact" ? "parent" : "child",
    created_at: "2026-01-01T00:00:00Z",
    primary_contact: relationshipRole === "primary_contact",
    secondary_contact: false,
    relationship_role: relationshipRole,
    position_type: null,
    users: {
      user_uuid: userId,
      email: `${userId}@example.com`,
      first_name: firstName,
      last_name: "Contact",
      avatar_url: null,
      phone: null,
      mobile_phone: null,
      job_title: null,
      disabled: false,
      last_sign_in_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  });

  return {
    rpc: vi.fn(),
    from: vi.fn(),
    invoke: vi.fn(),
    getSession: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    invalidateQueries: vi.fn(),
    invalidateCapacity: vi.fn(),
    clientRow,
    member,
    contact: {
      id: 7,
      first_name: "Taylor",
      last_name: "Contact",
      email: "taylor@example.com",
      position_type: null,
      status: "active" as const,
      promoted_to_user_id: null,
      promoted_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  };
});

const {
  rpc,
  from,
  invoke,
  getSession,
  toastSuccess,
  toastError,
  invalidateQueries,
  invalidateCapacity,
  clientRow,
  member,
  contact,
} = mocks;

function queryResult(data: unknown = [], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    auth: { getSession: mocks.getSession },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, message: vi.fn() },
}));

vi.mock("@/hooks/use-client-tenant-users", () => ({
  useClientTenantUsers: () => ({ data: [mocks.clientRow], isLoading: false, isError: false }),
}));

vi.mock("@/contexts/ClientTenantContext", () => ({
  useClientTenant: () => ({
    activeTenantId: 42,
    tenantName: "Demo RTO",
    canManagePortalUsers: true,
    isReadOnly: false,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { user_uuid: "actor-user" },
    isSuperAdmin: () => true,
    hasTenantAdmin: () => true,
  }),
}));

vi.mock("@/hooks/useRBAC", () => ({ useRBAC: () => ({ isVivacityTeam: false }) }));
vi.mock("@/hooks/useUserCapacity", () => ({
  useUserCapacity: () => ({ data: { atLimit: false } }),
  useInvalidateUserCapacity: () => mocks.invalidateCapacity,
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/components/client/TenantContactsSection", () => ({
  TenantContactsSection: () => <div data-testid="contacts-section" />,
}));
vi.mock("@/components/client/TenantInviteDialog", () => ({
  TenantInviteDialog: () => null,
}));
vi.mock("@/components/client/users/InviteUserDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/client/users/RevokeInviteAlert", () => ({
  default: () => null,
}));
vi.mock("@/components/client/users/CapacityPill", () => ({ CapacityPill: () => null }));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, onSelect }: { children: React.ReactNode; onClick?: () => void; onSelect?: (event: Event) => void }) => (
    <button role="menuitem" onClick={(event) => { onClick?.(); onSelect?.(event.nativeEvent); }}>{children}</button>
  ),
  DropdownMenuSeparator: () => null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) => (
    <select value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string; children: React.ReactNode }) => <option value={value}>{value}</option>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean }) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button disabled={disabled} onClick={onClick}>{children}</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ClientUsersPage from "@/components/client/ClientUsersPage";
import { TenantUsersTab } from "@/components/client/TenantUsersTab";

const { TenantContactsSection } = await vi.importActual<typeof import("@/components/client/TenantContactsSection")>(
  "@/components/client/TenantContactsSection",
);

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  from.mockImplementation((table: string) => {
    if (table === "tenant_contacts") return queryResult([contact]);
    if (table === "tenant_users") return queryResult([member("primary", "Primary", "primary_contact"), member("target", "Target", "user")]);
    return queryResult([]);
  });
  rpc.mockResolvedValue({ data: null, error: null });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
  getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
});

describe("client identity promotion and swap characterization", () => {
  it("confirms and performs a client swap, including a ghost-profile row, without client-side auth writes", async () => {
    renderWithQuery(<ClientUsersPage />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Contact" }));
    const confirmation = screen.getByRole("alertdialog");
    expect(within(confirmation).getByRole("heading", { name: "Swap to Contact" })).toBeInTheDocument();
    expect(confirmation.textContent).toContain("Ghost User will lose their Unicorn login");

    fireEvent.click(within(confirmation).getByRole("button", { name: "Swap to Contact" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("swap_tenant_user_to_contact", {
      p_tenant_id: 42,
      p_user_id: "ghost-user",
    }));
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Ghost User swapped to the contact list");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces an RPC swap failure and leaves the backend ghost/FK disposition untouched", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("ghost profile audit FK skipped") });
    renderWithQuery(<ClientUsersPage />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Swap to Contact" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Swap to Contact" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("ghost profile audit FK skipped"));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("requires confirmation before replacing an existing primary contact", async () => {
    renderWithQuery(<TenantUsersTab tenantId={42} tenantName="Demo RTO" />);
    await waitFor(() => expect(screen.getByText("Team Members")).toBeInTheDocument());

    const targetRoleSelect = screen.getAllByRole("combobox").find(
      (element) => (element as HTMLSelectElement).value === "user",
    );
    expect(targetRoleSelect).toBeDefined();
    fireEvent.change(targetRoleSelect!, { target: { value: "primary_contact" } });
    const confirmation = screen.getByRole("alertdialog");
    expect(within(confirmation).getByText("Swap Primary Contact?")).toBeInTheDocument();
    expect(confirmation.textContent).toContain("Primary Contact");
    expect(confirmation.textContent).toContain("Target Contact");
    expect(confirmation.textContent).toContain("Secondary Contact");

    fireEvent.click(within(confirmation).getByRole("button", { name: "Swap Primary" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_relationship_role", {
      p_tenant_id: 42,
      p_user_id: "target",
      p_relationship_role: "primary_contact",
      p_reason: null,
    }));
  });

  it("promotes a contact through invite-user with the role ceiling and real-email path", async () => {
    renderWithQuery(<TenantContactsSection tenantId={42} tenantName="Demo RTO" canManage positionTypeOptions={[]} />);
    await waitFor(() => expect(screen.getByText("Taylor Contact")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("menuitem", { name: "Promote to User" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/will be sent an email/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Promote" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("invite-user", expect.objectContaining({
      body: expect.objectContaining({
        invite_as: "CLIENT",
        tenant_id: 42,
        unicorn_role: "User",
        relationship_role: "user",
        skip_email: false,
      }),
    })));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("Invitation sent to taylor@example.com"));
  });

  it("surfaces an invite-user failure without archiving the contact locally", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("capacity rejected") });
    renderWithQuery(<TenantContactsSection tenantId={42} tenantName="Demo RTO" canManage positionTypeOptions={[]} />);
    await waitFor(() => expect(screen.getByText("Taylor Contact")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("menuitem", { name: "Promote to User" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Promote" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("seat may be at capacity")));
    expect(screen.getByText("Taylor Contact")).toBeInTheDocument();
  });
});
