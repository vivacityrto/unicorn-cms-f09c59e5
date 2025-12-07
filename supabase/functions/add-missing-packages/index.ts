import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if packages already exist
    const { data: existing } = await supabase
      .from('packages')
      .select('name')
      .in('name', ['M-DR', 'M-DC']);

    const existingNames = existing?.map(p => p.name) || [];
    const packagesToAdd = [];

    if (!existingNames.includes('M-DR')) {
      packagesToAdd.push({
        name: 'M-DR',
        full_text: 'Diamond RTO Membership',
        details: 'Membership gives them 112 hours to use with Vivacity over a year, including consult time with a client success champion, access to VIV training and all UNICORN docs',
        status: 'active',
        slug: '/package-m-dr'
      });
    }

    if (!existingNames.includes('M-DC')) {
      packagesToAdd.push({
        name: 'M-DC',
        full_text: 'Diamond CRICOS Membership',
        details: 'Membership gives them 126 hours to use with Vivacity over a year, including consult time with a client success champion, access to VIV training and all UNICORN docs for RTO and CRICOS',
        status: 'active',
        slug: '/package-m-dc'
      });
    }

    if (packagesToAdd.length > 0) {
      const { data, error } = await supabase
        .from('packages')
        .insert(packagesToAdd)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Added ${packagesToAdd.length} package(s)`,
          packages: data 
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Packages already exist',
        existing: existingNames
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
