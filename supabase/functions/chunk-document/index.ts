import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChunkDocumentRequest {
  doc_file_id: string;
  tenant_id: number;
  extracted_text: string;
  page_breaks?: number[]; // character positions where page breaks occur
}

interface Chunk {
  chunk_index: number;
  chunk_text: string;
  page_ref: string | null;
}

/**
 * Chunks text into segments of 800-1200 chars with 150-char overlap.
 * Prefers breaking at sentence boundaries (. ! ? newline).
 */
function chunkText(
  text: string,
  pageBreaks?: number[]
): Chunk[] {
  const MIN_CHUNK = 800;
  const MAX_CHUNK = 1200;
  const OVERLAP = 150;
  const chunks: Chunk[] = [];

  let pos = 0;
  let chunkIndex = 0;

  while (pos < text.length) {
    // Determine end boundary
    let end = Math.min(pos + MAX_CHUNK, text.length);

    if (end < text.length) {
      // Try to break at a sentence boundary within [MIN_CHUNK, MAX_CHUNK]
      let bestBreak = -1;
      const searchStart = pos + MIN_CHUNK;
      const searchEnd = end;
      const breakChars = [".\n", ".\r", ". ", "!\n", "! ", "?\n", "? ", "\n\n", "\n"];

      for (const bc of breakChars) {
        const idx = text.indexOf(bc, searchStart);
        if (idx !== -1 && idx + bc.length <= searchEnd) {
          bestBreak = idx + bc.length;
          break;
        }
      }

      if (bestBreak > 0) {
        end = bestBreak;
      }
    }

    const chunkText = text.slice(pos, end).trim();

    if (chunkText.length > 0) {
      // Determine page reference from page breaks
      let pageRef: string | null = null;
      if (pageBreaks && pageBreaks.length > 0) {
        let page = 1;
        for (const pb of pageBreaks) {
          if (pos >= pb) {
            page++;
          } else {
            break;
          }
        }
        pageRef = `p${page}`;
      }

      chunks.push({
        chunk_index: chunkIndex,
        chunk_text: chunkText,
        page_ref: pageRef,
      });
      chunkIndex++;
    }

    // Advance with overlap
    const advance = end - pos - OVERLAP;
    pos += Math.max(advance, 1);

    // If remaining text is less than MIN_CHUNK/2, absorb it into the last chunk
    if (text.length - pos < MIN_CHUNK / 2 && pos < text.length) {
      const remaining = text.slice(pos).trim();
      if (remaining.length > 0 && chunks.length > 0) {
        // Append to last chunk
        chunks[chunks.length - 1].chunk_text += " " + remaining;
      } else if (remaining.length > 0) {
        chunks.push({
          chunk_index: chunkIndex,
          chunk_text: remaining,
          page_ref: null,
        });
      }
      break;
    }
  }

  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user via their JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ChunkDocumentRequest = await req.json();
    const { doc_file_id, tenant_id, extracted_text, page_breaks } = body;

    if (!doc_file_id || !tenant_id || !extracted_text) {
      return new Response(
        JSON.stringify({ error: "doc_file_id, tenant_id, and extracted_text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify doc_file exists
    const { data: docFile, error: docError } = await supabase
      .from("doc_files")
      .select("doc_file_id")
      .eq("doc_file_id", doc_file_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (docError || !docFile) {
      return new Response(
        JSON.stringify({ error: "Document file not found or tenant mismatch" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chunk the text
    const chunks = chunkText(extracted_text, page_breaks);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No chunks produced from extracted text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete any existing chunks for this doc (re-processing)
    await supabase
      .from("doc_chunks")
      .delete()
      .eq("doc_file_id", doc_file_id);

    // Insert chunks in batches of 50
    const BATCH_SIZE = 50;
    let insertedCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((c) => ({
        tenant_id,
        doc_file_id,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        page_ref: c.page_ref,
      }));

      const { error: insertError } = await supabase
        .from("doc_chunks")
        .insert(batch);

      if (insertError) {
        console.error("Chunk insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to insert chunks", detail: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      insertedCount += batch.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        doc_file_id,
        chunks_created: insertedCount,
        avg_chunk_length: Math.round(
          chunks.reduce((sum, c) => sum + c.chunk_text.length, 0) / chunks.length
        ),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("chunk-document error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
