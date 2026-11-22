import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Stateless client using the implicit flow, only for SENDING auth emails
 * (sign-up confirmation, password reset). PKCE links break when the email is
 * opened in another browser/app (no code verifier there); implicit links carry
 * the session in the URL hash and work anywhere. AuthHashHandler consumes them.
 */
export function createMailerClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
