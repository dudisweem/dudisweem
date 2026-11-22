import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { Role } from "@/domain/labels";

// Email links (signup confirmation, password recovery) verified by token_hash.
// Unlike the PKCE code flow this works when the mail is opened in a different
// browser or app than the one that requested it (e.g. Gmail's in-app browser).
const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const base = url.origin;

  if (!tokenHash || !type || !TYPES.includes(type)) return NextResponse.redirect(`${base}/login?state=expired`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return NextResponse.redirect(`${base}/login?state=expired`);

  if (type === "recovery") return NextResponse.redirect(`${base}/reset`);
  const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return NextResponse.redirect(`${base}${homeFor((p?.role as Role) ?? "parent")}`);
}
