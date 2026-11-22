import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "../AuthFrame";
import { ResetForm } from "../AuthForms";
import { getProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "סיסמה חדשה" };

export default async function ResetPage() {
  // reachable only with the recovery session set by /auth/callback
  const me = await getProfile();
  if (!me) redirect("/login?state=expired");
  return (
    <AuthFrame kicker={me.email} title="בחירת סיסמה חדשה">
      <ResetForm />
    </AuthFrame>
  );
}
