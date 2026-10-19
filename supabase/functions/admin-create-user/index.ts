import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must be configured for this function.');
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'Authentication is required.' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: callerResult, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !callerResult.user) return respond({ error: 'Authentication is invalid or expired.' }, 401);

  const { data: callerProfile, error: profileError } = await callerClient
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', callerResult.user.id)
    .single();
  if (profileError || callerProfile?.role !== 'System Admin') {
    return respond({ error: 'Only a System Admin can create users.' }, 403);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return respond({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return respond({ error: 'Request body must be a JSON object.' }, 400);
  }
  const body = input as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const role = body.role;
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return respond({ error: 'Enter a valid name and email address.' }, 400);
  }
  if (password.length < 12 || password.length > 72) {
    return respond({ error: 'Password must contain between 12 and 72 characters.' }, 400);
  }
  if (!['System Admin', 'Sales', 'Accountant', 'Client'].includes(String(role))) {
    return respond({ error: 'The selected role is not valid.' }, 400);
  }
  if (title.length > 120) return respond({ error: 'Job title must be 120 characters or fewer.' }, 400);

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createError || !created.user) {
    return respond({ error: createError?.message ?? 'Supabase did not create the user.' }, 400);
  }

  const { data: profile, error: updateError } = await serviceClient
    .from('user_profiles')
    .update({ name, title, role, tenant_id: callerProfile.tenant_id })
    .eq('id', created.user.id)
    .select('id, name, email, role, title')
    .single();
  if (updateError || !profile) {
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(created.user.id);
    if (deleteError) console.error('Could not roll back user after profile update failed.', deleteError.message);
    console.error('Could not assign the requested user profile.', updateError?.message);
    return respond({ error: 'User account was created but its role could not be assigned. Please retry or contact an administrator.' }, 500);
  }

  return respond({ user: profile }, 201);
});

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
