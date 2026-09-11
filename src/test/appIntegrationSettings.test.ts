import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { fetchAppIntegrationSettings, saveSharepointSiteUrl, saveStaffOnboardingUrls } from "@/hooks/appIntegrationSettings";

function selectQuery(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

function updateQuery(result: unknown) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAppIntegrationSettings", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("returns the settings row fields", async () => {
    const data = {
      sharepoint_site_url: "https://vivacity.sharepoint.com/sites/Clients",
      staff_induction_video_url: "https://academy.example/video",
      staff_onboarding_workbook_url: "https://vivacity.sharepoint.com/workbook.pdf",
    };
    const builder = selectQuery({ data, error: null });
    mocks.from.mockReturnValue(builder);

    await expect(fetchAppIntegrationSettings()).resolves.toEqual(data);
    expect(mocks.from).toHaveBeenCalledWith("app_settings");
    expect(builder.select).toHaveBeenCalledWith("sharepoint_site_url, staff_induction_video_url, staff_onboarding_workbook_url");
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(builder.single).toHaveBeenCalledOnce();
  });

  it("returns null when there is no row", async () => {
    mocks.from.mockReturnValue(selectQuery({ data: null, error: null }));

    await expect(fetchAppIntegrationSettings()).resolves.toBeNull();
  });
});

describe("saveSharepointSiteUrl", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("trims and saves the SharePoint URL", async () => {
    const builder = updateQuery({ data: null, error: null });
    mocks.from.mockReturnValue(builder);

    await saveSharepointSiteUrl("  https://vivacity.sharepoint.com/sites/Clients  ");

    expect(builder.update).toHaveBeenCalledWith({ sharepoint_site_url: "https://vivacity.sharepoint.com/sites/Clients" });
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
  });

  it("saves null for a blank/whitespace-only URL", async () => {
    const builder = updateQuery({ data: null, error: null });
    mocks.from.mockReturnValue(builder);

    await saveSharepointSiteUrl("   ");

    expect(builder.update).toHaveBeenCalledWith({ sharepoint_site_url: null });
  });

  it("propagates an update error", async () => {
    const error = new Error("update failed");
    mocks.from.mockReturnValue(updateQuery({ data: null, error }));

    await expect(saveSharepointSiteUrl("https://example.com")).rejects.toThrow("update failed");
  });
});

describe("saveStaffOnboardingUrls", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("trims and saves both onboarding URLs", async () => {
    const builder = updateQuery({ data: null, error: null });
    mocks.from.mockReturnValue(builder);

    await saveStaffOnboardingUrls("  https://academy.example/video  ", "  https://vivacity.sharepoint.com/workbook.pdf  ");

    expect(builder.update).toHaveBeenCalledWith({
      staff_induction_video_url: "https://academy.example/video",
      staff_onboarding_workbook_url: "https://vivacity.sharepoint.com/workbook.pdf",
    });
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
  });

  it("propagates an update error", async () => {
    const error = new Error("onboarding update failed");
    mocks.from.mockReturnValue(updateQuery({ data: null, error }));

    await expect(saveStaffOnboardingUrls("a", "b")).rejects.toThrow("onboarding update failed");
  });
});
