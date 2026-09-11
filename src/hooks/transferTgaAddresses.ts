import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export interface TgaAddressInput {
  address_type?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

export interface TgaDeliveryLocationInput {
  location_name?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

export interface TransferTgaAddressesResult {
  count: number;
  transferDate: string;
}

/**
 * Replaces the tenant's addresses with the current TGA registered and delivery
 * locations. The caller owns guards, loading/toast state, and dialog state;
 * this adapter preserves the existing classification and write contract.
 */
export async function transferTgaAddresses(
  tenantId: number,
  userId: string,
  addresses: readonly TgaAddressInput[],
  deliveryLocations: readonly TgaDeliveryLocationInput[]
): Promise<TransferTgaAddressesResult> {
  const now = new Date().toISOString();
  const dateLabel = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const { error: deleteError } = await supabase
    .from("tenant_addresses")
    .delete()
    .eq("tenant_id", tenantId);
  if (deleteError) throw deleteError;

  let hoAssigned = false;
  let poAssigned = false;
  const rows: TablesInsert<"tenant_addresses">[] = [];

  for (const addr of addresses) {
    let addressType = "OT";
    if (addr.address_type === "headOffice" && !hoAssigned) {
      addressType = "HO"; hoAssigned = true;
    } else if (addr.address_type === "postal" && !poAssigned) {
      addressType = "PO"; poAssigned = true;
    }
    const suburb = addr.suburb?.toUpperCase() || "";
    const state = addr.state?.toUpperCase() || "";
    rows.push({
      tenant_id: tenantId,
      address_type: addressType,
      address1: addr.address_line_1 || "",
      address2: addr.address_line_2 || null,
      suburb,
      state,
      postcode: addr.postcode || null,
      country: "Australia",
      country_code: "AU",
      full_address: [addr.address_line_1, addr.address_line_2, suburb, state, addr.postcode].filter(Boolean).join(", "),
      notes: `Imported from TGA on ${dateLabel}`,
      created_by: userId,
      updated_by: userId,
      transfer_date: now,
      inactive: false,
    });
  }

  for (const loc of deliveryLocations) {
    const suburb = loc.suburb?.toUpperCase() || "";
    const state = loc.state?.toUpperCase() || "";
    rows.push({
      tenant_id: tenantId,
      address_type: "DS",
      address1: loc.address_line_1 || "",
      address2: loc.address_line_2 || null,
      suburb,
      state,
      postcode: loc.postcode || null,
      country: "Australia",
      country_code: "AU",
      full_address: [loc.address_line_1, loc.address_line_2, suburb, state, loc.postcode].filter(Boolean).join(", "),
      tga_site_name: loc.location_name || null,
      notes: `Imported from TGA on ${dateLabel}`,
      created_by: userId,
      updated_by: userId,
      transfer_date: now,
      inactive: false,
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("tenant_addresses")
      .insert(rows);
    if (insertError) throw insertError;
  }

  return { count: rows.length, transferDate: now };
}
