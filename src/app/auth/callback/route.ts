import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { Role } from "@/domain/labels";

// Exchanges the one-time code and redirects immediately so the code never stays in browser history.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next");
  const next = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;
  const base = url.origin;

  if (!code) return NextResponse.redirect(`${base}/login?state=expired`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${base}/login?state=expired`);

  if (next) return NextResponse.redirect(`${base}${next}`);
  const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return NextResponse.redirect(`${base}${homeFor((p?.role as Role) ?? "parent")}`);
}
