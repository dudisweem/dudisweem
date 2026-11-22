import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login?state=signed_out", request.url), { status: 303 });
  res.headers.set("Clear-Site-Data", '"cache", "storage"');
  return res;
}
