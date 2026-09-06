import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts";

const SIGNED_URL_TTL = 157_680_000; // 5 years
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const CENTER_X = 510;

function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function formatIssuedDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1. Body
    let body: { certificate_id?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, 400, { ok: false, code: "BAD_REQUEST", detail: "Invalid JSON body" });
    }
    const certificateId = Number(body.certificate_id);
    if (!Number.isFinite(certificateId)) {
      return jsonResponse(req, 400, { ok: false, code: "BAD_REQUEST", detail: "certificate_id (number) required" });
    }

    const caller = await requireCaller(req, supabase, {
      featureKey: FeatureKeys.staffInternal,
      headers: corsHeaders(req),
      errorStyle: "ok-code",
      unauthorizedMessage: "Missing Authorization header",
      forbiddenMessage: "Not authorised for this certificate",
      orAllow: async ({ userId, admin }) => {
        const { data: c } = await admin
          .from("academy_certificates")
          .select("user_id")
          .eq("id", certificateId)
          .maybeSingle();
        if (!c) return true;
        return c.user_id === userId;
      },
    });
    if (!caller.ok) return caller.response;

    // 3. Fetch cert
    const { data: cert, error: certErr } = await supabase
      .from("academy_certificates")
      .select("id, user_id, tenant_id, certificate_number, issued_at, metadata, storage_path, public_url, course_id")
      .eq("id", certificateId)
      .maybeSingle();

    if (certErr) {
      return jsonResponse(req, 500, { ok: false, code: "NOT_FOUND", detail: certErr.message });
    }
    if (!cert) {
      return jsonResponse(req, 404, { ok: false, code: "NOT_FOUND", detail: "Certificate not found" });
    }

    // 5. Fast path
    if (cert.storage_path) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("academy-certificates")
        .createSignedUrl(cert.storage_path, SIGNED_URL_TTL);
      if (signErr || !signed?.signedUrl) {
        return jsonResponse(req, 500, { ok: false, code: "UPLOAD_FAILED", detail: signErr?.message ?? "Sign failed" });
      }
      await supabase
        .from("academy_certificates")
        .update({ public_url: signed.signedUrl })
        .eq("id", certificateId);
      return jsonResponse(req, 200, { ok: true, data: { public_url: signed.signedUrl } });
    }

    // 6a. Recipient name
      const metadata = (cert.metadata ?? {}) as Record<string, unknown>;
      let recipientName: string | null = typeof metadata.recipient_full_name === "string"
        ? metadata.recipient_full_name
        : null;
    if (!recipientName) {
      const { data: userRow } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("user_uuid", cert.user_id)
        .maybeSingle();
      if (userRow) {
        const combined = `${userRow.first_name ?? ""} ${userRow.last_name ?? ""}`.trim();
        if (combined) recipientName = combined;
      }
    }
    if (!recipientName) recipientName = "Valued Learner";

    // 6b. Course title
    let courseTitle: string | null = metadata.course_title ?? null;
    if (!courseTitle) {
      const { data: courseRow } = await supabase
        .from("academy_courses")
        .select("title")
        .eq("id", cert.course_id)
        .maybeSingle();
      courseTitle = courseRow?.title ?? `Course ${cert.course_id}`;
    }

    // 6c. Template
    const { data: tplBlob, error: tplErr } = await supabase.storage
      .from("doc-templates")
      .download("academy/certificate-template-a4.png");
    if (tplErr || !tplBlob) {
      return jsonResponse(req, 500, { ok: false, code: "TEMPLATE_FETCH_FAILED", detail: tplErr?.message ?? "Template missing" });
    }
    const tplBytes = new Uint8Array(await tplBlob.arrayBuffer());

    // 6d. Build PDF
    let pdfBytes: Uint8Array;
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      const bg = await pdfDoc.embedPng(tplBytes);
      page.drawImage(bg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const drawCentered = (
        text: string,
        font: typeof helv,
        size: number,
        color: ReturnType<typeof rgb>,
        y: number,
      ) => {
        const w = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: CENTER_X - w / 2, y, size, font, color });
      };

      drawCentered("This is to certify that", helv, 11, rgb(0.4, 0.4, 0.4), 335);
      drawCentered(recipientName, helvB, 30, rgb(0.267, 0.137, 0.373), 295);
      drawCentered("has successfully completed", helv, 11, rgb(0.4, 0.4, 0.4), 260);
      drawCentered(courseTitle, helvB, 18, rgb(0.443, 0.188, 0.627), 228);
      const footer = `Issued: ${formatIssuedDate(cert.issued_at)}  ·  Certificate No. ${cert.certificate_number}`;
      drawCentered(footer, helv, 10, rgb(0.5, 0.5, 0.5), 190);

      pdfBytes = await pdfDoc.save();
    } catch (e) {
      return jsonResponse(req, 500, { ok: false, code: "PDF_GENERATION_FAILED", detail: (e as Error).message });
    }

    // 6e. Upload
    const storagePath = `${cert.tenant_id}/${cert.certificate_number}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("academy-certificates")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      return jsonResponse(req, 500, { ok: false, code: "UPLOAD_FAILED", detail: upErr.message });
    }

    // 6f. Sign
    const { data: signed, error: signErr } = await supabase.storage
      .from("academy-certificates")
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      return jsonResponse(req, 500, { ok: false, code: "UPLOAD_FAILED", detail: signErr?.message ?? "Sign failed" });
    }

    // 6g. Persist
    await supabase
      .from("academy_certificates")
      .update({ storage_path: storagePath, public_url: signed.signedUrl })
      .eq("id", certificateId);

    return jsonResponse(req, 200, { ok: true, data: { public_url: signed.signedUrl } });
  } catch (e) {
    return jsonResponse(req, 500, { ok: false, code: "PDF_GENERATION_FAILED", detail: (e as Error).message });
  }
});
