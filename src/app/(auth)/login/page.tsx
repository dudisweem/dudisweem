import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "../AuthFrame";
import { LoginForm } from "../AuthForms";
import { getProfile, homeFor } from "@/lib/auth";

export const metadata: Metadata = { title: "התחברות" };

const NOTICES: Record<string, string> = {
  expired: "הקישור פג תוקף או כבר נוצל. התחברו או בקשו קישור חדש.",
  inactive: "החשבון הושהה. צרו קשר עם בית הספר.",
  google_error: "ההתחברות עם Google לא הושלמה. נסו שוב.",
  signed_out: "התנתקתם בהצלחה.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const me = await getProfile();
  if (me?.active) redirect(homeFor(me.role));
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;
  const notice = typeof sp.state === "string" ? NOTICES[sp.state] : undefined;
  return (
    <AuthFrame kicker="שמחים לראות אתכם" title="התחברות">
      <LoginForm next={next} notice={notice} />
    </AuthFrame>
  );
}
