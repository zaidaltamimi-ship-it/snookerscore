import { createClient } from '@supabase/supabase-js';

// The anon key is PUBLIC by design — it identifies the project, it does not
// grant access. Row Level Security in the database is what protects the data,
// which is why the schema locks everything to club membership.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,     // tablets must stay enrolled across restarts
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// Enrol this device as a scoring station. Anonymous sign-in gives the tablet a
// durable identity; enrol_device then attaches it to the club.
export async function enrolDevice(joinCode, deviceName, tableName) {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc('enrol_device', {
    code: joinCode,
    device_name: deviceName,
    table_name: tableName || null
  });
  if (error) throw error;
  return data;
}
