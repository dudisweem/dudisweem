"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { Role } from "@/domain/labels";

export type AuthState = { error?: string; ok?: string; fields?: Record<string, string> } | null;

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** only same-site relative paths; blocks open redirects like //evil.com */
function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
}

const email = z.string().trim().toLowerCase().email("כתובת מייל לא תקינה");
const password = z.string().min(8, "סיסמה של 8 תווים לפחות");

export async function signIn(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "צריך סיסמה") }).safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, fields: { email: String(fd.get("email") ?? "") } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const msg = error?.code === "email_not_confirmed" ? "צריך לאשר את המייל קודם. בדקו את תיבת הדואר." : "המייל או הסיסמה לא נכונים.";
    return { error: msg, fields: { email: parsed.data.email } };
  }
  const { data: p } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).single();
  if (p && !p.active) {
    await supabase.auth.signOut();
    return { error: "החשבון הושהה. צרו קשר עם בית הספר." };
  }
  redirect(safeNext(fd.get("next")) ?? homeFor((p?.role as Role) ?? "parent"));
}

export async function signUp(_: AuthState, fd: FormData): Promise<AuthState> {
  const schema = z
    .object({
      full_name: z.string().trim().min(2, "שם מלא, לפחות 2 תווים").max(120),
      phone: z.string().trim().regex(/^0\d{8,9}$|^\+?\d{9,14}$/, "מספר טלפון לא תקין"),
      email,
      password,
      confirm: z.string(),
      terms: z.literal("on", { message: "צריך לאשר את תנאי השימוש" }),
    })
    .refine((v) => v.password === v.confirm, { message: "הסיסמאות לא תואמות", path: ["confirm"] });
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  const fields = { full_name: raw.full_name ?? "", phone: raw.phone ?? "", email: raw.email ?? "" };
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, fields };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/callback`,
      data: { full_name: parsed.data.full_name, phone: parsed.data.phone.replace(/[^\d+]/g, "") },
    },
  });
  if (error) {
    const msg = error.code === "weak_password" ? "הסיסמה חלשה מדי. נסו סיסמה ארוכה יותר." : error.code === "over_email_send_rate_limit" ? "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." : "לא הצלחנו ליצור חשבון. נסו שוב.";
    return { error: msg, fields };
  }
  if (data.session) redirect("/home");
  // neutral: same message whether or not the email already exists
  return { ok: "שלחנו מייל אישור. לחצו על הקישור במייל כדי להפעיל את החשבון." };
}

export async function signInWithGoogle(fd: FormData) {
  const supabase = await createClient();
  const next = safeNext(fd.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?state=google_error");
  redirect(data.url);
}

export async function forgotPassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = email.safeParse(fd.get("email"));
  if (!parsed.success) return { error: "כתובת מייל לא תקינה" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await origin()}/auth/callback?next=/reset` });
  return { ok: "אם המייל רשום אצלנו, שלחנו אליו קישור לאיפוס סיסמה." };
}

export async function resetPassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "הסיסמאות לא תואמות" })
    .safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "זו הסיסמה הקיימת. בחרו סיסמה חדשה." : "הקישור פג תוקף. בקשו קישור חדש." };
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user?.id ?? "").single();
  redirect(homeFor((p?.role as Role) ?? "parent"));
}
