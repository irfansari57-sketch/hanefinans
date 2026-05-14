import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'hane-finans-web/0.1' } },
  });
  return _client;
}

export const isSupabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** Edge Function çağırıcısı. functionName örnek: "tcmb-evds" */
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: unknown,
): Promise<T | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data, error } = await client.functions.invoke<T>(functionName, {
      body: body as Record<string, unknown> | undefined,
    });
    if (error) {
      console.warn(`Edge function ${functionName} hatası:`, error.message);
      return null;
    }
    return (data as T) ?? null;
  } catch (e) {
    console.warn(`Edge function ${functionName} istisna:`, e);
    return null;
  }
}
