"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { forgotPassword, resetPassword, signIn, signInWithFacebook, signInWithGoogle, signUp, type AuthState } from "./actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";

function GoogleButton({ next }: { next?: string }) {
  return (
    <form action={signInWithGoogle}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton variant="ghost" full className="gbtn" pendingLabel="מעבירים לגוגל…">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        המשך עם Google
      </SubmitButton>
    </form>
  );
}

// Facebook login is built but hidden until the Meta app is set up in Supabase.
const FACEBOOK_ENABLED = false;

function FacebookButton({ next }: { next?: string }) {
  return (
    <form action={signInWithFacebook}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton variant="ghost" full className="fbbtn" pendingLabel="מעבירים לפייסבוק…">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#fff" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07Z" />
        </svg>
        המשך עם Facebook
      </SubmitButton>
    </form>
  );
}

function SocialButtons({ next }: { next?: string }) {
  return (
    <div className="stack-s">
      <GoogleButton next={next} />
      {FACEBOOK_ENABLED ? <FacebookButton next={next} /> : null}
    </div>
  );
}

function PasswordInput({ name, id, autoComplete }: { name: string; id: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="inp ltr"
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        dir="ltr"
        style={{ paddingRight: 52, paddingLeft: 14 }}
      />
      <button
        type="button"
        className="iconbtn"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "הסתרת סיסמה" : "הצגת סיסמה"}
        aria-pressed={show}
        style={{ position: "absolute", right: 4, top: 4 }}
      >
        <Icon name="eye" small />
      </button>
    </div>
  );
}

function Feedback({ state }: { state: AuthState }) {
  if (!state) return null;
  if (state.error) return <Alert kind="bad">{state.error}</Alert>;
  if (state.ok) return <Alert kind="ok">{state.ok}</Alert>;
  return null;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <div className="stack">
      {notice ? <Alert kind="info">{notice}</Alert> : null}
      <SocialButtons next={next} />
      <div className="divider">או עם מייל וסיסמה</div>
      <form action={action} className="stack" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="field">
          <label htmlFor="email">מייל</label>
          <input className="inp ltr" id="email" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" required defaultValue={state?.fields?.email} />
        </div>
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor="password">סיסמה</label>
            <Link className="link small" href="/forgot">שכחתי סיסמה</Link>
          </div>
          <PasswordInput name="password" id="password" autoComplete="current-password" />
        </div>
        <Feedback state={state} />
        <SubmitButton full pendingLabel="מתחברים…">התחברות</SubmitButton>
      </form>
      <p className="center muted small" style={{ margin: 0 }}>
        עוד אין חשבון?{" "}
        <Link className="link" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>הרשמה להורים</Link>
      </p>
    </div>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) {
    return (
      <div className="stack center">
        <div className="success" style={{ padding: 0 }}>
          <div className="drop">
            <div className="lvl" />
            <Icon name="mail" />
          </div>
          <h2 style={{ margin: 0 }}>כמעט שם</h2>
          <p className="muted" style={{ margin: 0 }}>{state.ok}</p>
        </div>
        <Link href="/login" className="btn ghost full">חזרה להתחברות</Link>
      </div>
    );
  }
  const f = state?.fields ?? {};
  return (
    <div className="stack">
      <SocialButtons />
      <div className="divider">או הרשמה עם מייל</div>
      <form action={action} className="stack" noValidate>
        <div className="field">
          <label htmlFor="full_name">שם מלא של ההורה</label>
          <input className="inp" id="full_name" name="full_name" autoComplete="name" required defaultValue={f.full_name} />
        </div>
        <div className="field">
          <label htmlFor="phone">טלפון נייד</label>
          <input className="inp ltr" id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required placeholder="0500000000" defaultValue={f.phone} />
        </div>
        <div className="field">
          <label htmlFor="email">מייל</label>
          <input className="inp ltr" id="email" name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" required defaultValue={f.email} />
        </div>
        <div className="cols2">
          <div className="field">
            <label htmlFor="password">סיסמה</label>
            <PasswordInput name="password" id="password" autoComplete="new-password" />
            <span className="hint">8 תווים לפחות</span>
          </div>
          <div className="field">
            <label htmlFor="confirm">אימות סיסמה</label>
            <PasswordInput name="confirm" id="confirm" autoComplete="new-password" />
          </div>
        </div>
        <label className="ck">
          <input type="checkbox" name="terms" required />
          <span>קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות של בית הספר</span>
        </label>
        <Feedback state={state} />
        <SubmitButton full pendingLabel="יוצרים חשבון…">יצירת חשבון</SubmitButton>
      </form>
      <p className="center muted small" style={{ margin: 0 }}>
        כבר רשומים? <Link className="link" href="/login">התחברות</Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(forgotPassword, null);
  return (
    <form action={action} className="stack" noValidate>
      <p className="muted" style={{ margin: 0 }}>נשלח אליכם קישור לבחירת סיסמה חדשה.</p>
      <div className="field">
        <label htmlFor="email">מייל</label>
        <input className="inp ltr" id="email" name="email" type="email" autoComplete="email" dir="ltr" required />
      </div>
      <Feedback state={state} />
      <SubmitButton full pendingLabel="שולחים…">שליחת קישור</SubmitButton>
      <Link className="link center small" href="/login">חזרה להתחברות</Link>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(resetPassword, null);
  return (
    <form action={action} className="stack" noValidate>
      <div className="field">
        <label htmlFor="password">סיסמה חדשה</label>
        <PasswordInput name="password" id="password" autoComplete="new-password" />
      </div>
      <div className="field">
        <label htmlFor="confirm">אימות סיסמה</label>
        <PasswordInput name="confirm" id="confirm" autoComplete="new-password" />
      </div>
      <Feedback state={state} />
      <SubmitButton full>שמירת סיסמה</SubmitButton>
    </form>
  );
}
