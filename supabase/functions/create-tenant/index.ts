/**
 * HISTORICAL — create-tenant
 *
 * Still ACTIVE on project yxkgdalkbrriasiyyrwk (verify_jwt: true; orphan — no
 * in-repo callers). Live tenant creation goes through AddTenantDialog →
 * tenants.insert, gated by UI permission clients.create.
 *
 * Provenance: verified deployed source via Supabase MCP get_edge_function
 * (function id c605d302-9737-400d-879c-cd4fb02dff1a, version 61), plus the
 * M2 pre-check fix from the 14 Jul 2026 Unicorn security audit follow-up.
 *
 * M2: the live pre-check queried non-existent users columns (role / id) and
 * denied every caller. Replaced with rpc('is_superadmin') to match the gate
 * that create_tenant itself enforces (lower(global_role) = 'superadmin').
 * Authorization is forwarded so auth.uid() is set for that RPC.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCaller, FeatureKeys } from "../_shared/requireCaller.ts"
import { corsHeaders } from "../_shared/cors.ts";

interface CreateTenantRequest {
  name: string;
  slug: string;
  adminEmail?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Forward caller JWT so create_tenant sees auth.uid().
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const caller = await requireCaller(req, supabaseClient, {
      featureKey: FeatureKeys.clientsCreate,
      headers: corsHeaders(req),
      unauthorizedMessage: "Invalid authentication",
      forbiddenMessage: "Insufficient permissions - SuperAdmin required",
    });
    if (!caller.ok) return caller.response;

    const body: CreateTenantRequest = await req.json()

    if (!body.name || !body.slug) {
      throw new Error('Name and slug are required')
    }

    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens')
    }

    const { data: tenantId, error: createError } = await supabaseClient
      .rpc('create_tenant', {
        p_name: body.name,
        p_slug: body.slug,
        p_admin_email: body.adminEmail || null
      })

    if (createError) {
      throw createError
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenantId,
        message: 'Tenant created successfully'
      }),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 201,
      }
    )

  } catch (error) {
    console.error('Error creating tenant:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
