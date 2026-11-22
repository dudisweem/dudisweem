import { NextResponse, type NextRequest } from "next/server";
import { getProfile, homeFor } from "@/lib/auth";

// Role-based landing after a session was established client-side.
export async function GET(request: NextRequest) {
  const me = await getProfile();
  const base = new URL(request.url).origin;
  if (!me) return NextResponse.redirect(`${base}/login?state=expired`);
  return NextResponse.redirect(`${base}${homeFor(me.role)}`);
}
