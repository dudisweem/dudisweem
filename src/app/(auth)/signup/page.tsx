import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "../AuthFrame";
import { SignupForm } from "../AuthForms";
import { getProfile, homeFor } from "@/lib/auth";

export const metadata: Metadata = { title: "הרשמה" };

export default async function SignupPage() {
  const me = await getProfile();
  if (me?.active) redirect(homeFor(me.role));
  return (
    <AuthFrame kicker="חשבון הורה אחד לכל הילדים" title="הרשמה">
      <SignupForm />
    </AuthFrame>
  );
}
