import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Kid = {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: "m" | "f" | "other" | null;
  swim_level: string;
  emergency_name: string;
  emergency_phone: string;
  notes: string;
  color: string;
  health_signed_at: string | null;
  health_signed_by: string | null;
  health_signature_path: string | null;
  active: boolean;
};

export type Credit = {
  id: string;
  student_id: string;
  service_id: string | null;
  lessons_total: number;
  lessons_used: number;
  expires_at: string | null;
  paid: boolean;
  created_at: string;
};

export type BookingRow = {
  id: string;
  number: number;
  student_id: string;
  service_id: string;
  instructor_id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "declined" | "cancelled" | "completed" | "no_show";
  price_agorot: number;
  payment_method: "cash" | "bit" | "paybox" | "card";
  paid: boolean;
  parent_note: string;
  lesson_report: string;
  service: { name: string; duration_min: number } | null;
};

/** Kids this user owns plus kids shared with them as an accepted guardian. */
export async function getMyKids(parentId: string, includeInactive = false) {
  const supabase = await createClient();
  const { data: shared } = await supabase
    .from("guardianships")
    .select("student_id")
    .eq("user_id", parentId)
    .not("accepted_at", "is", null);
  const sharedIds = (shared ?? []).map((g) => g.student_id as string).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  let q = supabase
    .from("students")
    .select("*")
    .or(sharedIds.length ? `parent_id.eq.${parentId},id.in.(${sharedIds.join(",")})` : `parent_id.eq.${parentId}`)
    .order("created_at");
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as Kid[];
}

export type Medical = { allergies: string; medical_notes: string; health_answers: HealthAnswers | null };
export type HealthAnswers = {
  version?: number;
  answers?: Record<string, { answer: "yes" | "no"; details: string }>;
  fit?: "fit" | "unfit";
  extra?: string;
  photos?: boolean;
};

/** Decrypted medical fields (DB enforces owner / guardian / admin; empty for anyone else). */
export async function getMedical(studentId: string): Promise<Medical> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_student_medical", { p_student: studentId });
  const row = (data as Medical[] | null)?.[0];
  return { allergies: row?.allergies ?? "", medical_notes: row?.medical_notes ?? "", health_answers: row?.health_answers ?? null };
}

export type Guardian = { id: string; invited_email: string; full_name: string; accepted: boolean; is_me: boolean };
export async function getGuardians(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("kid_guardians", { p_student: studentId });
  return (data ?? []) as Guardian[];
}

export type Invitation = { id: string; student_first_name: string; inviter_name: string; created_at: string };
export async function getMyInvitations() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_invitations");
  return (data ?? []) as Invitation[];
}

export async function getMyCredits() {
  const supabase = await createClient();
  const { data } = await supabase.from("credits").select("*").order("created_at");
  return (data ?? []) as Credit[];
}

/** usable credits left per kid (not expired) */
export function creditsLeft(credits: Credit[], kidId: string, serviceId?: string, at = new Date()) {
  const usable = credits.filter(
    (c) =>
      c.student_id === kidId &&
      (!c.expires_at || new Date(c.expires_at) > at) &&
      (!serviceId || !c.service_id || c.service_id === serviceId),
  );
  return {
    left: usable.reduce((s, c) => s + (c.lessons_total - c.lessons_used), 0),
    total: usable.reduce((s, c) => s + c.lessons_total, 0),
  };
}

export async function getInstructorNames() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("instructor_names");
  const map = new Map<string, { name: string; color: string }>();
  for (const r of (data ?? []) as { id: string; full_name: string; color: string }[]) map.set(r.id, { name: r.full_name || "מדריך", color: r.color });
  return map;
}

export async function getBookings(kidIds: string[]) {
  if (!kidIds.length) return [] as BookingRow[];
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, number, student_id, service_id, instructor_id, starts_at, ends_at, status, price_agorot, payment_method, paid, parent_note, lesson_report, service:services(name, duration_min)")
    .in("student_id", kidIds)
    .order("starts_at", { ascending: true });
  return (data ?? []) as unknown as BookingRow[];
}

export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hourCycle: "h23" }).format(now));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

export function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] ?? "";
}
