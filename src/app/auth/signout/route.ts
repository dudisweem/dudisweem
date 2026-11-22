import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

// Sign-out must clear the auth cookies ON the redirect response itself. Cookies written through
// next/headers' cookies() were not carried onto a freshly built NextResponse, so the session
// was revoked server-side but the browser kept its cookies and stayed "logged in".
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?state=signed_out", request.url), { status: 303 });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // local scope: end this device's session even if it was already revoked elsewhere
  await supabase.auth.signOut({ scope: "local" });

  // belt and braces: expire every Supabase auth cookie (including chunked .0/.1 parts)
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  response.headers.set("Cache-Control", "no-store");
  return response;
}
