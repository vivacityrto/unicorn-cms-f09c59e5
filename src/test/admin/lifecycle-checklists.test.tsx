import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LifecycleTemplateGrid } from "@/components/admin/lifecycle/LifecycleTemplateGrid";
import { LifecycleTemplateDialog } from "@/components/admin/lifecycle/LifecycleTemplateDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LifecycleDropdownItem, LifecycleTemplate } from "@/features/lifecycle/types";

const mockUseLifecycleDropdowns = vi.fn();
const mockUseLifecycleTemplates = vi.fn();
const mockToast = vi.fn();

vi.mock("@/hooks/useLifecycleChecklists", () => ({
  useLifecycleDropdowns: () => mockUseLifecycleDropdowns(),
  useLifecycleTemplates: (lifecycleType?: string) => mockUseLifecycleTemplates(lifecycleType),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

const lifecycleTypes: LifecycleDropdownItem[] = [
  { id: 1, code: "client_onboarding", label: "Client Onboarding", description: null, sort_order: 1, is_active: true },
  { id: 2, code: "client_offboarding", label: "Client Offboarding", description: null, sort_order: 2, is_active: true },
  { id: 3, code: "staff_onboarding", label: "Staff Onboarding", description: null, sort_order: 3, is_active: true },
  { id: 4, code: "staff_offboarding", label: "Staff Offboarding", description: null, sort_order: 4, is_active: true },
];

const categories: LifecycleDropdownItem[] = [
  { id: 1, code: "m365_groups", label: "M365 Groups", description: null, sort_order: 1, is_active: true },
];

const responsibleRoles: LifecycleDropdownItem[] = [
  { id: 1, code: "csc", label: "CSC", description: null, sort_order: 1, is_active: true },
];

const template: LifecycleTemplate = {
  id: "template-1",
  lifecycle_type: "client_onboarding",
  category: "m365_groups",
  step_title: "Add user to M365 group",
  description: "Grant the approved group membership.",
  responsible_role: "csc",
  default_assignee_id: null,
  external_link: "https://admin.microsoft.com/",
  sort_order: 2,
  is_default: true,
  is_active: true,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

function mutation() {
  return { mutate: vi.fn(), isPending: false };
}

function templateQuery(overrides: Record<string, unknown> = {}) {
  return {
    templates: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: mutation(),
    updateTemplate: mutation(),
    deleteTemplate: mutation(),
    ...overrides,
  };
}

function renderGrid(overrides: Partial<React.ComponentProps<typeof LifecycleTemplateGrid>> = {}) {
  const callbacks = {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCopyToCounterpart: vi.fn(),
  };

  const result = render(
    <TooltipProvider>
      <LifecycleTemplateGrid
        groupedTemplates={[[template.category, [template]]]}
        categoryLabels={{ m365_groups: "M365 Groups" }}
        roleLabels={{ csc: "CSC" }}
        loading={false}
        counterpartLabel="Client Offboarding"
        {...callbacks}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return { ...result, callbacks };
}

describe("LifecycleTemplateGrid characterization", () => {
  it("shows loading skeletons while template data is pending", () => {
    renderGrid({ loading: true, groupedTemplates: [] });

    expect(screen.queryByText("No checklist steps configured for this lifecycle type yet.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("generic").length).toBeGreaterThan(0);
  });

  it("shows the empty state when a lifecycle type has no templates", () => {
    renderGrid({ groupedTemplates: [] });

    expect(screen.getByText("No checklist steps configured for this lifecycle type yet.")).toBeInTheDocument();
    expect(screen.getByText('Click "Add Step" to create the first one.')).toBeInTheDocument();
  });

  it("renders populated, inactive, categorized, and role-labelled steps", () => {
    renderGrid({
      groupedTemplates: [[template.category, [{ ...template, is_active: false }]]],
    });

    expect(screen.getByText("M365 Groups")).toBeInTheDocument();
    expect(screen.getByText("Add user to M365 group")).toBeInTheDocument();
    expect(screen.getByText("Grant the approved group membership.")).toBeInTheDocument();
    expect(screen.getByText("CSC")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("preserves the existing view, copy, edit, deactivate, and external-link interactions", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { callbacks } = renderGrid();
    const row = screen.getByText(template.step_title).closest("div.flex.items-center.justify-between");

    expect(row).not.toBeNull();
    const buttons = within(row as HTMLElement).getAllByRole("button");
    expect(buttons).toHaveLength(5);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);
    fireEvent.click(buttons[4]);

    expect(openSpy).toHaveBeenCalledWith(template.external_link, "_blank");
    expect(callbacks.onView).toHaveBeenCalledWith(template);
    expect(callbacks.onCopyToCounterpart).toHaveBeenCalledWith(template);
    expect(callbacks.onEdit).toHaveBeenCalledWith(template);
    expect(callbacks.onDelete).toHaveBeenCalledWith(template);
    openSpy.mockRestore();
  });
});

describe("LifecycleTemplateDialog characterization", () => {
  it("initializes an add form and emits the current fields on submit", () => {
    const onSave = vi.fn();
    render(
      <LifecycleTemplateDialog
        open
        onClose={vi.fn()}
        template={null}
        categories={categories}
        responsibleRoles={responsibleRoles}
        onSave={onSave}
        saving={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Step Title *"), { target: { value: "Create CRM record" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Create the record." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Step" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      step_title: "Create CRM record",
      description: "Create the record.",
      category: "m365_groups",
      responsible_role: null,
      is_default: true,
      is_active: true,
    }));
  });

  it("hydrates edit fields from an existing template", () => {
    render(
      <LifecycleTemplateDialog
        open
        onClose={vi.fn()}
        template={template}
        categories={categories}
        responsibleRoles={responsibleRoles}
        onSave={vi.fn()}
        saving={false}
      />,
    );

    expect(screen.getByLabelText("Step Title *")).toHaveValue(template.step_title);
    expect(screen.getByLabelText("Description")).toHaveValue(template.description);
    expect(screen.getByLabelText("External Link")).toHaveValue(template.external_link);
    expect(screen.getByLabelText("Sort Order")).toHaveValue(template.sort_order);
  });
});

describe("LifecycleChecklistsAdmin route and query characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLifecycleDropdowns.mockReturnValue({
      lifecycleTypes,
      responsibleRoles,
      categories,
      isLoading: false,
    });
    mockUseLifecycleTemplates.mockReturnValue(templateQuery({ templates: [template] }));
  });

  it("loads the first active lifecycle type and its templates", async () => {
    const { default: LifecycleChecklistsAdmin } = await import("@/pages/admin/LifecycleChecklistsAdmin");
    render(
      <TooltipProvider>
        <LifecycleChecklistsAdmin />
      </TooltipProvider>,
    );

    expect(mockUseLifecycleTemplates).toHaveBeenCalledWith("client_onboarding");
    expect(screen.getByRole("heading", { name: "Lifecycle Checklists" })).toBeInTheDocument();
    expect(screen.getByText(template.step_title)).toBeInTheDocument();
  });

  it("requests a new template set when the lifecycle tab changes", async () => {
    mockUseLifecycleTemplates.mockImplementation((lifecycleType?: string) =>
      templateQuery({
        templates: lifecycleType === "client_offboarding"
          ? [{ ...template, id: "template-2", lifecycle_type: "client_offboarding", step_title: "Revoke access" }]
          : [template],
      }),
    );
    const { default: LifecycleChecklistsAdmin } = await import("@/pages/admin/LifecycleChecklistsAdmin");
    render(
      <TooltipProvider>
        <LifecycleChecklistsAdmin />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Client Offboarding" }));

    await waitFor(() => expect(mockUseLifecycleTemplates).toHaveBeenLastCalledWith("client_offboarding"));
    expect(screen.getByText("Revoke access")).toBeInTheDocument();
  });

  it("wires the add flow to the selected lifecycle type", async () => {
    const createTemplate = mutation();
    mockUseLifecycleTemplates.mockReturnValue(templateQuery({ createTemplate }));
    const { default: LifecycleChecklistsAdmin } = await import("@/pages/admin/LifecycleChecklistsAdmin");
    render(
      <TooltipProvider>
        <LifecycleChecklistsAdmin />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Step" }));
    fireEvent.change(screen.getByLabelText("Step Title *"), { target: { value: "Create CRM record" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Step" }));

    expect(createTemplate.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle_type: "client_onboarding", step_title: "Create CRM record" }),
      expect.any(Object),
    );
  });

  it("wires the deactivate confirmation to a soft-deactivation mutation", async () => {
    const deleteTemplate = mutation();
    mockUseLifecycleTemplates.mockReturnValue(templateQuery({ templates: [template], deleteTemplate }));
    const { default: LifecycleChecklistsAdmin } = await import("@/pages/admin/LifecycleChecklistsAdmin");
    render(
      <TooltipProvider>
        <LifecycleChecklistsAdmin />
      </TooltipProvider>,
    );

    const row = screen.getByText(template.step_title).closest("div.flex.items-center.justify-between");
    expect(row).not.toBeNull();
    const buttons = within(row as HTMLElement).getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(deleteTemplate.mutate).toHaveBeenCalledWith(template.id, expect.any(Object));
  });

  it("characterizes the current query-error behavior as no dedicated error panel", async () => {
    mockUseLifecycleTemplates.mockReturnValue(templateQuery({ error: new Error("templates unavailable") }));
    const { default: LifecycleChecklistsAdmin } = await import("@/pages/admin/LifecycleChecklistsAdmin");
    render(
      <TooltipProvider>
        <LifecycleChecklistsAdmin />
      </TooltipProvider>,
    );

    expect(screen.getByText("No checklist steps configured for this lifecycle type yet.")).toBeInTheDocument();
    expect(screen.queryByText("templates unavailable")).not.toBeInTheDocument();
  });

  it("keeps the lifecycle route inside the requireSuperAdmin route group", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/dashboardRoutes.tsx"), "utf8");
    const normalized = source.replace(/\s+/g, " ");
    const guardStart = normalized.indexOf("<Route element={<ProtectedRoute requireSuperAdmin><DashboardLayoutRoute /></ProtectedRoute>}>");
    const lifecycleRoute = normalized.indexOf('<Route path="/admin/lifecycle-checklists"');
    const nextRouteGroup = normalized.indexOf("<Route element=", guardStart + 1);

    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(lifecycleRoute).toBeGreaterThan(guardStart);
    expect(lifecycleRoute).toBeLessThan(nextRouteGroup);
  });

  it("records the current broader database policy separately from the route guard", () => {
    const policySource = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260513052935_11410abb-0432-472e-bb4b-87e29cea8866.sql"),
      "utf8",
    );

    expect(policySource).toMatch(
      /lifecycle_checklist_templates_vivacity_all[\s\S]*is_vivacity_staff/,
    );
    expect(policySource).toMatch(
      /lifecycle_checklist_templates_vivacity_select[\s\S]*is_vivacity_staff/,
    );
  });
});
