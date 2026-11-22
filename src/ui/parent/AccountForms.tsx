"use client";
import { useActionState } from "react";
import { changePassword, updateMyProfile, type FormState } from "@/app/(parent)/actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <Alert kind="bad">{state.error}</Alert>;
  if (state?.ok) return <Alert kind="ok">{state.ok}</Alert>;
  return null;
}

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateMyProfile, null);
  return (
    <form action={action} className="surf pad stack" noValidate>
      <h2 style={{ margin: 0, font: "800 16px var(--f-ui)" }}>פרטים אישיים</h2>
      <div className="field">
        <label htmlFor="full_name">שם מלא</label>
        <input className="inp" id="full_name" name="full_name" autoComplete="name" required defaultValue={fullName} />
      </div>
      <div className="field">
        <label htmlFor="phone">טלפון נייד</label>
        <input className="inp ltr" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" defaultValue={phone} />
      </div>
      <div className="field">
        <label htmlFor="email">מייל</label>
        <input className="inp ltr" id="email" type="email" dir="ltr" value={email} readOnly aria-describedby="email-hint" />
        <span className="hint" id="email-hint">המייל משמש להתחברות ולא ניתן לשנות אותו כאן.</span>
      </div>
      <Feedback state={state} />
      <SubmitButton>שמירה</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, null);
  return (
    <form action={action} className="surf pad stack" noValidate>
      <h2 style={{ margin: 0, font: "800 16px var(--f-ui)" }}>שינוי סיסמה</h2>
      <p className="hint" style={{ margin: 0 }}>נרשמתם עם Google? אפשר להגדיר כאן גם סיסמה להתחברות עם מייל.</p>
      <div className="cols2">
        <div className="field">
          <label htmlFor="password">סיסמה חדשה</label>
          <input className="inp ltr" id="password" name="password" type="password" autoComplete="new-password" dir="ltr" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">אימות סיסמה</label>
          <input className="inp ltr" id="confirm" name="confirm" type="password" autoComplete="new-password" dir="ltr" minLength={8} required />
        </div>
      </div>
      <Feedback state={state} />
      <SubmitButton variant="solid">עדכון סיסמה</SubmitButton>
    </form>
  );
}
