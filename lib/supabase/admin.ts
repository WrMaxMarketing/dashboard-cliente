import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com service role — SO no servidor. Cria usuarios via
// auth.admin. NUNCA importar isto em codigo que chega ao browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
