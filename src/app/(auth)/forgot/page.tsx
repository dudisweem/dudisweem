import type { Metadata } from "next";
import { AuthFrame } from "../AuthFrame";
import { ForgotForm } from "../AuthForms";

export const metadata: Metadata = { title: "שכחתי סיסמה" };

export default function ForgotPage() {
  return (
    <AuthFrame kicker="קורה לכולם" title="איפוס סיסמה">
      <ForgotForm />
    </AuthFrame>
  );
}
