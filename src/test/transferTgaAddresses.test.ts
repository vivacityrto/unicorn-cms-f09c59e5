import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import { transferTgaAddresses } from "@/hooks/transferTgaAddresses";

function tenantAddressQuery(deleteResult: unknown, insertResult = deleteResult) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(deleteResult)),
    insert: vi.fn(() => Promise.resolve(insertResult)),
  };
  return builder;
}

describe("transferTgaAddresses", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T01:02:03.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces addresses with normalized registered and delivery rows", async () => {
    const query = tenantAddressQuery({ data: null, error: null });
    mocks.from.mockReturnValue(query);

    await expect(transferTgaAddresses(42, "user-7", [
      {
        address_type: "headOffice",
        address_line_1: "1 Main St",
        address_line_2: "Suite 2",
        suburb: "sydney",
        state: "nsw",
        postcode: "2000",
      },
      {
        address_type: "postal",
        address_line_1: "PO Box 9",
        address_line_2: null,
        suburb: "melbourne",
        state: "vic",
        postcode: "3000",
      },
    ], [
      {
        location_name: "North Site",
        address_line_1: "3 Site Rd",
        address_line_2: null,
        suburb: "brisbane",
        state: "qld",
        postcode: "4000",
      },
    ])).resolves.toEqual({ count: 3, transferDate: "2026-09-11T01:02:03.000Z" });

    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("tenant_id", 42);
    expect(query.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        tenant_id: 42,
        address_type: "HO",
        address1: "1 Main St",
        address2: "Suite 2",
        suburb: "SYDNEY",
        state: "NSW",
        postcode: "2000",
        country: "Australia",
        country_code: "AU",
        full_address: "1 Main St, Suite 2, SYDNEY, NSW, 2000",
        created_by: "user-7",
        updated_by: "user-7",
        transfer_date: "2026-09-11T01:02:03.000Z",
        inactive: false,
      }),
      expect.objectContaining({
        tenant_id: 42,
        address_type: "PO",
        address1: "PO Box 9",
        suburb: "MELBOURNE",
        state: "VIC",
        full_address: "PO Box 9, MELBOURNE, VIC, 3000",
      }),
      expect.objectContaining({
        tenant_id: 42,
        address_type: "DS",
        address1: "3 Site Rd",
        suburb: "BRISBANE",
        state: "QLD",
        full_address: "3 Site Rd, BRISBANE, QLD, 4000",
        tga_site_name: "North Site",
      }),
    ]);

    const insertedRows = (query.insert.mock.calls as unknown[][])[0][0] as Array<Record<string, unknown>>;
    expect(insertedRows.every((row) => row.notes === "Imported from TGA on 11 Sept 2026")).toBe(true);
    expect(insertedRows.every((row) => row.transfer_date === "2026-09-11T01:02:03.000Z")).toBe(true);
  });

  it("assigns OT to additional registered head-office or postal rows", async () => {
    const query = tenantAddressQuery({ data: null, error: null });
    mocks.from.mockReturnValue(query);

    await transferTgaAddresses(42, "user-7", [
      { address_type: "headOffice", address_line_1: "1 A", suburb: "x", state: "nsw", postcode: "1" },
      { address_type: "headOffice", address_line_1: "2 B", suburb: "y", state: "nsw", postcode: "2" },
      { address_type: "postal", address_line_1: "3 C", suburb: "z", state: "nsw", postcode: "3" },
      { address_type: "postal", address_line_1: "4 D", suburb: "w", state: "nsw", postcode: "4" },
    ], []);

    const insertedRows = (query.insert.mock.calls as unknown[][])[0][0] as Array<Record<string, unknown>>;
    expect(insertedRows.map((row) => row.address_type)).toEqual(["HO", "OT", "PO", "OT"]);
  });

  it("skips the insert when no TGA addresses are available", async () => {
    const query = tenantAddressQuery({ data: null, error: null });
    mocks.from.mockReturnValue(query);

    await expect(transferTgaAddresses(42, "user-7", [], [])).resolves.toEqual({
      count: 0,
      transferDate: "2026-09-11T01:02:03.000Z",
    });

    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.insert).not.toHaveBeenCalled();
  });

  it("propagates a delete error without attempting the insert", async () => {
    const error = new Error("address delete failed");
    const query = tenantAddressQuery({ data: null, error });
    mocks.from.mockReturnValue(query);

    await expect(transferTgaAddresses(42, "user-7", [
      { address_type: "headOffice", address_line_1: "1 A", suburb: "x", state: "nsw", postcode: "1" },
    ], [])).rejects.toThrow("address delete failed");

    expect(query.insert).not.toHaveBeenCalled();
  });

  it("propagates an insert error after the replacement delete", async () => {
    const query = tenantAddressQuery(
      { data: null, error: null },
      { data: null, error: new Error("address insert failed") }
    );
    mocks.from.mockReturnValue(query);

    await expect(transferTgaAddresses(42, "user-7", [
      { address_type: "headOffice", address_line_1: "1 A", suburb: "x", state: "nsw", postcode: "1" },
    ], [])).rejects.toThrow("address insert failed");

    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.insert).toHaveBeenCalledOnce();
  });
});
