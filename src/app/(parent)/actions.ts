"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { KID_COLORS, errorText } from "@/domain/labels";

export type FormState = { error?: string; ok?: string } | null;

const kidSchema = z.object({
  first_name: z.string().trim().min(1, "צריך שם פרטי").max(60),
  last_name: z.string().trim().max(60).default(""),
  birth_date: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) < new Date() && new Date(v) > new Date("1920-01-01")), "תאריך לידה לא תקין")
    .transform((v) => (v === "" ? null : v)),
  gender: z.enum(["m", "f", "other", ""]).transform((v) => (v === "" ? null : v)),
  swim_level: z.enum(["none", "beginner", "basic", "intermediate", "advanced"]),
  allergies: z.string().trim().max(500).default(""),
  medical_notes: z.string().trim().max(1000).default(""),
  emergency_name: z.string().trim().max(120).default(""),
  emergency_phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[\d+\-\s]{9,16}$/.test(v), "טלפון חירום לא תקין")
    .default(""),
  notes: z.string().trim().max(1000).default(""),
  color: z.string().refine((v) => KID_COLORS.includes(v), "צבע לא תקין"),
});

export async function saveKid(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getProfile();
  if (!me) redirect("/login");
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = kidSchema.safeParse({ ...raw, gender: raw.gender ?? "", color: raw.color ?? KID_COLORS[0] });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const id = raw.id && /^[0-9a-f-]{36}$/.test(raw.id) ? raw.id : null;
  // medical fields never go to the students table: they are encrypted at rest via set_student_medical
  const { allergies, medical_notes, ...profile } = parsed.data;
  const saveMedical = (studentId: string) =>
    supabase.rpc("set_student_medical", { p_student: studentId, p_allergies: allergies, p_medical_notes: medical_notes });
  if (id) {
    const { error } = await supabase.from("students").update(profile).eq("id", id);
    if (error) return { error: "לא הצלחנו לשמור. נסו שוב." };
    const med = await saveMedical(id);
    if (med.error || (med.data as { error?: string } | null)?.error) return { error: "הפרטים נשמרו, אבל המידע הרפואי לא נשמר. נסו שוב." };
    revalidatePath("/kids");
    revalidatePath(`/kids/${id}`);
    revalidatePath("/home");
    return { ok: "הפרטים נשמרו" };
  }
  const { data, error } = await supabase.from("students").insert({ ...profile, parent_id: me.id }).select("id").single();
  if (error || !data) return { error: "לא הצלחנו להוסיף את הילד. נסו שוב." };
  if (allergies || medical_notes) await saveMedical(data.id);
  revalidatePath("/kids");
  revalidatePath("/home");
  redirect(`/kids/${data.id}?new=1`);
}

export async function setKidActive(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "true";
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "לא נמצא" };
  const supabase = await createClient();
  const { error } = await supabase.from("students").update({ active }).eq("id", id);
  if (error) return { error: "לא הצלחנו לעדכן. נסו שוב." };
  revalidatePath("/kids");
  revalidatePath("/home");
  if (!active) redirect("/kids");
  revalidatePath(`/kids/${id}`);
  return { ok: "עודכן" };
}

const QUESTIONS = ["heart", "asthma", "epilepsy", "surgery", "meds", "other"] as const;

export async function signHealth(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("student_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "לא נמצא" };
  const answers: Record<string, { answer: "yes" | "no"; details: string }> = {};
  for (const q of QUESTIONS) {
    const a = fd.get(`q_${q}`);
    if (a !== "yes" && a !== "no") return { error: "נא לענות על כל השאלות" };
    const details = String(fd.get(`d_${q}`) ?? "").trim().slice(0, 500);
    if (a === "yes" && !details) return { error: "נא לפרט בכל שאלה שסומנה ״כן״" };
    answers[q] = { answer: a, details: a === "yes" ? details : "" };
  }
  const fit = fd.get("fit");
  if (fit !== "fit" && fit !== "unfit") return { error: "נא לבחור הצהרת כשירות" };
  const extra = String(fd.get("extra") ?? "").trim().slice(0, 1000);
  const signer = String(fd.get("signer") ?? "").trim();
  if (signer.length < 2) return { error: "נא לחתום בשם מלא" };
  if (fd.get("confirm") !== "on") return { error: "נא לאשר שהמידע נכון ומלא" };
  if (fd.get("policy") !== "on") return { error: "נא לאשר את מדיניות הביטול" };

  const supabase = await createClient();

  // optional drawn signature (typed name stays the accessible, required signature)
  let signaturePath: string | null = null;
  const drawn = String(fd.get("signature_png") ?? "");
  if (drawn) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(drawn);
    const bytes = m ? Buffer.from(m[1]!, "base64") : null;
    const isPng = bytes && bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!bytes || !isPng || bytes.length > 250_000) return { error: "החתימה לא נקלטה. נקו ונסו לחתום שוב." };
    const path = `${id}/${Date.now()}.png`;
    // private bucket; storage RLS allows insert only into the folder of a kid this user manages
    const { error: upErr } = await supabase.storage.from("signatures").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) return { error: "לא הצלחנו לשמור את החתימה. נסו שוב." };
    signaturePath = path;
  }

  const { data, error } = await supabase.rpc("sign_health", {
    p_student: id,
    p_answers: { version: 1, answers, fit, extra, photos: fd.get("photos") === "yes" },
    p_signed_by: signer,
    p_signature_path: signaturePath,
  });
  if (error || (data as { error?: string })?.error) return { error: "לא הצלחנו לשמור את ההצהרה. נסו שוב." };
  revalidatePath(`/kids/${id}`);
  revalidatePath("/home");
  revalidatePath("/book");
  redirect(`/kids/${id}?signed=1`);
}

export async function cancelBooking(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "לא נמצא" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking: id, p_reason: "" });
  const res = data as { ok?: boolean; error?: string; hours?: number } | null;
  if (error || !res?.ok) {
    const code = res?.error ?? "unknown";
    return { error: errorText(code) };
  }
  revalidatePath("/lessons");
  revalidatePath("/home");
  return { ok: "השיעור בוטל" };
}

export async function updateMyProfile(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getProfile();
  if (!me) redirect("/login");
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "שם מלא, לפחות 2 תווים").max(120),
      phone: z
        .string()
        .trim()
        .refine((v) => v === "" || /^[\d+\-\s]{9,16}$/.test(v), "מספר טלפון לא תקין"),
    })
    .safeParse({ full_name: fd.get("full_name"), phone: fd.get("phone") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone.replace(/[^\d+]/g, "") })
    .eq("id", me.id);
  if (error) return { error: "לא הצלחנו לשמור. נסו שוב." };
  revalidatePath("/", "layout");
  return { ok: "הפרטים נשמרו" };
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z
    .object({ password: z.string().min(8, "סיסמה של 8 תווים לפחות"), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "הסיסמאות לא תואמות" })
    .safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "זו הסיסמה הקיימת. בחרו סיסמה חדשה." };
    if (error.code === "reauthentication_needed") return { error: "מטעמי אבטחה צריך להתחבר מחדש לפני שינוי סיסמה." };
    return { error: "לא הצלחנו לעדכן את הסיסמה." };
  }
  return { ok: "הסיסמה עודכנה" };
}

// ---------------------------------------------------------------- guardians (second parent)
const GUARDIAN_ERR: Record<string, string> = {
  bad_email: "כתובת מייל לא תקינה",
  self_invite: "זה המייל שלכם — הזמינו הורה אחר",
  already_guardian: "ההורה הזה כבר מנהל את הילד",
  too_many_guardians: "אפשר להזמין עד 4 הורים נוספים",
  not_found: "רק ההורה שרשם את הילד יכול להזמין הורים נוספים",
};

export async function inviteGuardian(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("student_id") ?? "");
  const email = z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").safeParse(fd.get("email"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "לא נמצא" };
  if (!email.success) return { error: email.error.issues[0]!.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_guardian", { p_student: id, p_email: email.data });
  const res = data as { ok?: boolean; error?: string } | null;
  if (error || !res?.ok) return { error: GUARDIAN_ERR[res?.error ?? ""] ?? "לא הצלחנו לשמור את ההזמנה. נסו שוב." };
  revalidatePath(`/kids/${id}`);
  return { ok: `ההזמנה נשמרה. כשבעל/ת המייל ${email.data} יתחבר/תתחבר למערכת, ההזמנה תופיע בדף הבית לאישור.` };
}

export async function removeGuardian(_: FormState, fd: FormData): Promise<FormState> {
  const gid = String(fd.get("id") ?? "");
  const kid = String(fd.get("student_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(gid)) return { error: "לא נמצא" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_guardian", { p_guardianship: gid });
  if (error || !(data as { ok?: boolean } | null)?.ok) return { error: "לא הצלחנו להסיר. נסו שוב." };
  revalidatePath("/kids");
  revalidatePath("/home");
  if (fd.get("self") === "1") redirect("/kids");
  if (/^[0-9a-f-]{36}$/.test(kid)) revalidatePath(`/kids/${kid}`);
  return { ok: "הוסר" };
}

export async function respondInvitation(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const accept = fd.get("accept") === "1";
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "לא נמצא" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_invitation", { p_invitation: id, p_accept: accept });
  if (error || !(data as { ok?: boolean } | null)?.ok) return { error: "ההזמנה כבר לא בתוקף." };
  revalidatePath("/home");
  revalidatePath("/kids");
  return { ok: accept ? "ההזמנה אושרה. הילד מופיע עכשיו אצלכם." : "ההזמנה נדחתה." };
}
