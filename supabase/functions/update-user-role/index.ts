import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from "../_shared/cors.ts";

interface UpdateUserRoleRequest {
  user_uuid: string;
  unicorn_role?: 'Super Admin' | 'Team Leader' | 'Team Member'
    | 'Integrator' | 'BGT' | 'CSC' | 'CET'
    | 'Admin' | 'User' | 'Academy User';
  user_type?: 'Vivacity' | 'Vivacity Team' | 'Client' | 'Client Parent' | 'Client Child' | 'Member';
  tenant_id?: number | null;
  staff_team?: 'none' | 'business_growth' | 'client_success' | 'client_experience' | 'software_development' | 'leadership' | null;
  staff_teams?: string[];
  superadmin_level?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
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
        { status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, code: 'UNAUTHORIZED', detail: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller permission via central RPC
    const { data: allowed } = await supabase.rpc('check_permission', {
      p_user_id: user.id,
      p_feature_key: 'admin.team_users.manage',
      p_min_level: 'full',
    });

    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, code: 'FORBIDDEN', detail: 'You do not have permission to update user roles' }),
        { status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: UpdateUserRoleRequest = await req.json();
    const { user_uuid, unicorn_role, user_type, tenant_id, staff_team, staff_teams, superadmin_level } = body;

    if (!user_uuid) {
      return new Response(
        JSON.stringify({ ok: false, code: 'INVALID_REQUEST', detail: 'user_uuid is required' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate role/type combinations
    if (unicorn_role && user_type) {
      // Super Admin role requires Vivacity user type
      if (unicorn_role === 'Super Admin' && !['Vivacity', 'Vivacity Team'].includes(user_type)) {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Super Admin role requires Vivacity user type' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      // Team Member role also requires Vivacity user type
      if (unicorn_role === 'Team Member' && !['Vivacity', 'Vivacity Team'].includes(user_type)) {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Team Member role requires Vivacity user type' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      if (user_type === 'Client' && tenant_id === null) {
        return new Response(
          JSON.stringify({ ok: false, code: 'INVALID_COMBINATION', detail: 'Client user type requires a tenant assignment' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get current user data for audit log
    const { data: currentUserData } = await supabase
      .from('users')
      .select('unicorn_role, user_type, tenant_id, superadmin_level')
      .eq('user_uuid', user_uuid)
      .single();

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() };
    if (unicorn_role !== undefined) updates.unicorn_role = unicorn_role;
    if (user_type !== undefined) updates.user_type = user_type;
    if (tenant_id !== undefined) updates.tenant_id = tenant_id;
    if (staff_team !== undefined) updates.staff_team = staff_team;
    if (staff_teams !== undefined) updates.staff_teams = staff_teams;

    // Set superadmin_level: use explicit value if provided, otherwise derive from role
    if (superadmin_level !== undefined) {
      updates.superadmin_level = superadmin_level;
    } else if (unicorn_role !== undefined) {
      if (unicorn_role === 'Super Admin') {
        updates.superadmin_level = 'Administrator';
      } else if (unicorn_role === 'Team Leader') {
        updates.superadmin_level = 'Team Leader';
      } else {
        updates.superadmin_level = null;
      }
    }

    // Update user
    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('user_uuid', user_uuid);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ ok: false, code: 'UPDATE_FAILED', detail: updateError.message }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
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
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', detail: error.message }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
