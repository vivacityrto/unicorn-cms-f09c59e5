import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";

const CENTER_X = 297.64;
const FUCHSIA = rgb(0.929, 0.094, 0.471);

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function formatAuDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function tierFromCode(code: string | null | undefined): string | null {
  switch ((code ?? "").trim().toUpperCase()) {
    case "M-RR":
    case "M-RC":
      return "ruby";
    case "M-DR":
    case "M-DC":
      return "diamond";
    case "M-SAR":
    case "M-SAC":
      return "sapphire";
    case "M-GR":
    case "M-GC":
      return "gold";
    case "M-AM":
      return "amethyst";
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1. Auth
    const callerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!callerToken) {
      return jsonResponse(401, { ok: false, code: "NO_AUTH", detail: "Missing Authorization header" });
    }
    const { data: callerUser, error: callerErr } = await supabase.auth.getUser(callerToken);
    if (callerErr || !callerUser?.user) {
      return jsonResponse(401, { ok: false, code: "AUTH_FAILED", detail: callerErr?.message ?? "Invalid token" });
    }

    // 2. Body
    let body: { tenant_id?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { ok: false, code: "BAD_REQUEST", detail: "Invalid JSON body" });
    }
    const tenantId = Number(body.tenant_id);
    if (!Number.isFinite(tenantId)) {
      return jsonResponse(400, { ok: false, code: "BAD_REQUEST", detail: "tenant_id (number) required" });
    }

    // 3. Authorise — caller must belong to this tenant or be Vivacity internal
    const { data: callerRow, error: callerRowErr } = await supabase
      .from("users")
      .select("tenant_id, is_vivacity_internal")
      .eq("user_uuid", callerUser.user.id)
      .maybeSingle();
    if (callerRowErr) {
      return jsonResponse(500, { ok: false, code: "AUTH_LOOKUP_FAILED", detail: callerRowErr.message });
    }
    const isInternal = !!callerRow?.is_vivacity_internal;
    const isMember = Number(callerRow?.tenant_id) === tenantId;
    if (!isInternal && !isMember) {
      return jsonResponse(403, { ok: false, code: "FORBIDDEN", detail: "Not authorised for this tenant" });
    }

    // 4. Lookup active membership package instance for this tenant (flat queries — no PostgREST joins)
    const { data: piRow, error: piErr } = await supabase
      .from("package_instances")
      .select("start_date, package_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("billing_category", "membership_rto")
      .limit(1)
      .maybeSingle();

    if (piErr) {
      return jsonResponse(500, { ok: false, code: "LOOKUP_FAILED", detail: piErr.message });
    }
    if (!piRow) {
      return jsonResponse(404, { ok: false, code: "NO_MEMBERSHIP" });
    }

    const { data: pkgRow, error: pkgErr } = await supabase
      .from("packages")
      .select("name")
      .eq("id", (piRow as any).package_id)
      .maybeSingle();

    if (pkgErr) {
      return jsonResponse(500, { ok: false, code: "LOOKUP_FAILED", detail: pkgErr.message });
    }

    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantErr) {
      return jsonResponse(500, { ok: false, code: "LOOKUP_FAILED", detail: tenantErr.message });
    }

    const packageCode = (pkgRow as any)?.name as string | undefined;
    const tenantName = ((tenantRow as any)?.name as string | undefined) ?? "";
    const commencementDate = (piRow as any).start_date as string | undefined;

    // 5. Tier mapping
    const tier = tierFromCode(packageCode);
    if (!tier) {
      return jsonResponse(404, { ok: false, code: "NO_CERTIFICATE_FOR_TIER" });
    }
    if (tier !== "ruby") {
      return jsonResponse(404, { ok: false, code: "COMING_SOON" });
    }

    // 6. Template
    const { data: tplBlob, error: tplErr } = await supabase.storage
      .from("doc-templates")
      .download("membership/certificate-template-ruby.pdf");
    if (tplErr || !tplBlob) {
      return jsonResponse(500, {
        ok: false,
        code: "TEMPLATE_FETCH_FAILED",
        detail: tplErr?.message ?? "Template missing",
      });
    }
    const tplBytes = new Uint8Array(await tplBlob.arrayBuffer());

    // 7. Build PDF — load existing template (2-page A4), overlay on page 1 only
    let pdfBytes: Uint8Array;
    try {
      const pdfDoc = await PDFDocument.load(tplBytes);
      const page = pdfDoc.getPages()[0];
      const helvB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const drawCentered = (
        text: string,
        font: typeof helvB,
        size: number,
        color: ReturnType<typeof rgb>,
        y: number,
      ) => {
        const w = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: CENTER_X - w / 2, y, size, font, color });
      };

      drawCentered(tenantName ?? "", helvB, 28, FUCHSIA, 575);
      drawCentered(formatAuDate(commencementDate), helvB, 24, FUCHSIA, 435);

      pdfBytes = await pdfDoc.save();
    } catch (e) {
      return jsonResponse(500, {
        ok: false,
        code: "PDF_GENERATION_FAILED",
        detail: (e as Error).message,
      });
    }

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vivacity-membership-certificate.pdf"`,
        ...corsHeaders,
      },
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, code: "PDF_GENERATION_FAILED", detail: (e as Error).message });
  }
});
