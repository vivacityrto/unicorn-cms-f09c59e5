import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateUserRoleRequest {
  user_uuid: string;
  unicorn_role?: 'Super Admin' | 'Admin' | 'User';
  user_type?: 'Vivacity' | 'Client' | 'Member';
  tenant_id?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, code: 'UNAUTHORIZED', detail: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, code: 'UNAUTHORIZED', detail: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is Super Admin
    const { data: callerData, error: callerError } = await supabase
      .from('users')
      .select('unicorn_role, user_type')
      .eq('user_uuid', user.id)
      .single();

    if (callerError || !callerData || callerData.unicorn_role !== 'Super Admin' || callerData.user_type !== 'Vivacity') {
      console.error('Access denied:', { callerError, callerData });
      return new Response(
        JSON.stringify({ ok: false, code: 'FORBIDDEN', detail: 'Only Super Admins can update user roles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: UpdateUserRoleRequest = await req.json();
    const { user_uuid, unicorn_role, user_type, tenant_id } = body;

    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: 'INVALID_REQUEST', detail: 'user_uuid is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role/type combinations
    if (unicorn_role && user_type) {
      if (unicorn_role === 'Super Admin' && user_type !== 'Vivacity') {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Super Admin role requires Vivacity user type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (user_type === 'Vivacity' && unicorn_role !== 'Super Admin') {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Vivacity user type requires Super Admin role' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (user_type === 'Client' && tenant_id === null) {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Client user type requires a tenant assignment' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get current user data for audit log
    const { data: currentUserData } = await supabase
      .from('users')
      .select('unicorn_role, user_type, tenant_id')
      .eq('user_uuid', user_uuid)
      .single();

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() };
    if (unicorn_role !== undefined) updates.unicorn_role = unicorn_role;
    if (user_type !== undefined) updates.user_type = user_type;
    if (tenant_id !== undefined) updates.tenant_id = tenant_id;

    // Update user
    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('user_uuid', user_uuid);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ ok: false, code: 'UPDATE_FAILED', detail: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the change in audit_eos_events
    const auditDetails = {
      before: currentUserData,
      after: updates,
      changed_fields: Object.keys(updates).filter(k => k !== 'updated_at')
    };

    await supabase
      .from('audit_eos_events')
      .insert({
        tenant_id: currentUserData?.tenant_id || 319, // Default to Vivacity tenant
        user_id: user.id,
        entity: 'user_role',
        entity_id: user_uuid,
        action: 'role_updated',
        reason: 'Admin updated user role/type/tenant',
        details: auditDetails
      });

    console.log('User role updated successfully:', { user_uuid, updates });

    return new Response(
      JSON.stringify({ ok: true, message: 'User role updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
