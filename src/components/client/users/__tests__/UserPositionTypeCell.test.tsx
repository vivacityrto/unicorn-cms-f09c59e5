/* @vitest-environment jsdom */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// Radix Select needs pointer APIs jsdom does not have; a native <select> exercises the
// same value/onValueChange contract.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      data-testid="position-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { UserPositionTypeCell } from "../UserPositionTypeCell";
import type { ClientTenantUserRow } from "@/features/client-identity/models";

const options = [
  { value: "administration", label: "Administration", sort_order: 3 },
  { value: "admin_assistant", label: "Admin Assistant", sort_order: 7 },
];

function makeRow(overrides: Partial<ClientTenantUserRow> = {}): ClientTenantUserRow {
  return {
    row_type: "active",
    row_key: "u-1",
    tenant_id: 7532,
    user_id: "u-1",
    first_name: "Sam",
    last_name: "Lee",
    display_name: "Sam Lee",
    email: "sam@example.com",
    avatar_url: null,
    relationship_role: "user",
    primary_contact: false,
    secondary_contact: false,
    access_scope: "full",
    last_sign_in_at: null,
    last_active_at: null,
    invited_at: null,
    invite_expires_at: null,
    status: "active",
    member_since: null,
    last_sent_at: null,
    mailgun_message_id: null,
    ...overrides,
  };
}

function renderCell(props: Partial<React.ComponentProps<typeof UserPositionTypeCell>> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <UserPositionTypeCell
        row={makeRow()}
        tenantId={7532}
        value={null}
        options={options}
        canEdit
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

describe("UserPositionTypeCell", () => {
  beforeEach(() => {
    rpc.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("shows the label as text, with no dropdown, when the viewer cannot edit", () => {
    renderCell({ canEdit: false, value: "admin_assistant" });
    expect(screen.getByText("Admin Assistant")).toBeInTheDocument();
    expect(screen.queryByTestId("position-select")).not.toBeInTheDocument();
  });

  it("shows a dash when a user has no position type and the viewer cannot edit", () => {
    renderCell({ canEdit: false, value: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows nothing editable for an invited row that has no user yet", () => {
    renderCell({ row: makeRow({ row_type: "invited", user_id: null }) });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByTestId("position-select")).not.toBeInTheDocument();
  });

  it("offers every option plus a clear option to people who can edit", () => {
    renderCell({ value: "administration" });
    const select = screen.getByTestId("position-select") as HTMLSelectElement;
    expect(select.value).toBe("administration");
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      "No position type",
      "Administration",
      "Admin Assistant",
    ]);
  });

  it("saves a new position type through the RPC and refreshes the column", async () => {
    rpc.mockResolvedValue({ data: { ok: true, changed: true }, error: null });
    const { invalidate } = renderCell({ value: "administration" });

    fireEvent.change(screen.getByTestId("position-select"), { target: { value: "admin_assistant" } });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("set_tenant_user_position_type", {
      p_tenant_id: 7532,
      p_user_id: "u-1",
      p_position_type: "admin_assistant",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Position type updated"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["client_user_position_types", 7532] });
  });

  it("clears the position type by sending null", async () => {
    rpc.mockResolvedValue({ data: { ok: true, changed: true }, error: null });
    renderCell({ value: "administration" });

    fireEvent.change(screen.getByTestId("position-select"), { target: { value: "__none__" } });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("set_tenant_user_position_type", {
      p_tenant_id: 7532,
      p_user_id: "u-1",
      p_position_type: null,
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Position type cleared"));
  });

  it("does nothing when the selection is unchanged", () => {
    renderCell({ value: "administration" });
    fireEvent.change(screen.getByTestId("position-select"), { target: { value: "administration" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the server's message and does not refresh when the RPC refuses", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: new Error("Not authorized to change position types for tenant 7532"),
    });
    const { invalidate } = renderCell({ value: null });

    fireEvent.change(screen.getByTestId("position-select"), { target: { value: "administration" } });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Not authorized to change position types for tenant 7532"),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
