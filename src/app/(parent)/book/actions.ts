"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type Slot = { startsAt: string; instructorId: string; instructorName: string; spotsLeft: number };
export type BookResult =
  | { ok: true; bookingId: string; number: number; status: "pending" | "approved" }
  | { ok: false; code: string }
  | { ok: "unknown" };

const uuid = z.string().uuid();

export async function fetchSlots(serviceId: string, day: string, instructorId: string | null): Promise<{ slots: Slot[] } | { error: string }> {
  const parsed = z
    .object({ serviceId: uuid, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), instructorId: uuid.nullable() })
    .safeParse({ serviceId, day, instructorId });
  if (!parsed.success) return { error: "bad_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_service: parsed.data.serviceId,
    p_day: parsed.data.day,
    p_instructor: parsed.data.instructorId,
  });
  if (error) return { error: "fetch_failed" };
  return {
    slots: ((data ?? []) as { starts_at: string; instructor_id: string; instructor_name: string; spots_left: number }[]).map((r) => ({
      startsAt: r.starts_at,
      instructorId: r.instructor_id,
      instructorName: r.instructor_name || "מדריך",
      spotsLeft: r.spots_left,
    })),
  };
}

async function findByAttempt(attemptId: string): Promise<BookResult | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select("id, number, status").eq("attempt_id", attemptId).maybeSingle();
  if (!data) return null;
  return { ok: true, bookingId: data.id, number: data.number, status: data.status as "pending" | "approved" };
}

export async function submitBooking(input: {
  attemptId: string;
  studentId: string;
  serviceId: string;
  instructorId: string;
  startsAt: string;
  payment: "cash" | "bit" | "paybox" | "card";
  note: string;
}): Promise<BookResult> {
  const parsed = z
    .object({
      attemptId: uuid,
      studentId: uuid,
      serviceId: uuid,
      instructorId: uuid,
      startsAt: z.string().datetime({ offset: true }),
      payment: z.enum(["cash", "bit", "paybox", "card"]),
      note: z.string().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, code: "unknown" };
  const v = parsed.data;
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.rpc("request_booking", {
      p_attempt: v.attemptId,
      p_student: v.studentId,
      p_service: v.serviceId,
      p_instructor: v.instructorId,
      p_start: v.startsAt,
      p_payment: v.payment,
      p_note: v.note,
    });
    if (error) {
      // transport/server error: the write may or may not have happened — look it up by the same attempt id
      return (await findByAttempt(v.attemptId)) ?? { ok: "unknown" };
    }
    const r = data as { ok?: boolean; error?: string; booking_id?: string; number?: number; status?: "pending" | "approved" };
    revalidatePath("/home");
    revalidatePath("/lessons");
    if (r.ok && r.booking_id) return { ok: true, bookingId: r.booking_id, number: r.number ?? 0, status: r.status ?? "pending" };
    return { ok: false, code: r.error ?? "unknown" };
  } catch {
    return (await findByAttempt(v.attemptId).catch(() => null)) ?? { ok: "unknown" };
  }
}

/** used by the client while in the "checking" state — never creates anything */
export async function checkAttempt(attemptId: string): Promise<BookResult> {
  if (!uuid.safeParse(attemptId).success) return { ok: "unknown" };
  return (await findByAttempt(attemptId)) ?? { ok: "unknown" };
}
