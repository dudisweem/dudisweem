"use server";
import { createHash } from "node:crypto";
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

// ------------------------------------------------------------ recurring weekly lessons
export type SeriesWeek = { index: number; start: string; ok: boolean; status?: "pending" | "approved"; number?: number; code?: string };
export type SeriesResult = { ok: true; seriesId: string; booked: number; weeks: SeriesWeek[] } | { ok: false; code: string } | { ok: "unknown" };

/** series id is derived from the attempt id exactly like the DB does: md5(attempt || ':series')::uuid */
function seriesIdOf(attemptId: string) {
  const h = createHash("md5").update(`${attemptId}:series`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function findSeries(attemptId: string): Promise<SeriesResult | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, number, status, starts_at, series_index")
    .eq("series_id", seriesIdOf(attemptId))
    .order("series_index");
  if (!data || data.length === 0) return null;
  return {
    ok: true,
    seriesId: seriesIdOf(attemptId),
    booked: data.length,
    weeks: data.map((b) => ({ index: b.series_index ?? 0, start: b.starts_at, ok: true, status: b.status as "pending" | "approved", number: b.number })),
  };
}

export async function submitSeries(input: {
  attemptId: string;
  studentId: string;
  serviceId: string;
  instructorId: string;
  startsAt: string;
  weeks: number;
  payment: "cash" | "bit" | "paybox" | "card";
  note: string;
}): Promise<SeriesResult> {
  const parsed = z
    .object({
      attemptId: uuid,
      studentId: uuid,
      serviceId: uuid,
      instructorId: uuid,
      startsAt: z.string().datetime({ offset: true }),
      weeks: z.number().int().min(2).max(12),
      payment: z.enum(["cash", "bit", "paybox", "card"]),
      note: z.string().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, code: "unknown" };
  const v = parsed.data;
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.rpc("request_series", {
      p_attempt: v.attemptId,
      p_student: v.studentId,
      p_service: v.serviceId,
      p_instructor: v.instructorId,
      p_first_start: v.startsAt,
      p_weeks: v.weeks,
      p_payment: v.payment,
      p_note: v.note,
    });
    if (error) return (await findSeries(v.attemptId)) ?? { ok: "unknown" };
    revalidatePath("/home");
    revalidatePath("/lessons");
    const r = data as {
      ok?: boolean;
      error?: string;
      series_id?: string;
      booked?: number;
      weeks?: { index: number; start: string; result: { ok?: boolean; error?: string; status?: "pending" | "approved"; number?: number } }[];
    };
    if (r.error) return { ok: false, code: r.error };
    const weeks: SeriesWeek[] = (r.weeks ?? []).map((w) => ({
      index: w.index,
      start: w.start,
      ok: w.result.ok === true,
      status: w.result.status,
      number: w.result.number,
      code: w.result.error,
    }));
    if (!r.booked) return { ok: false, code: weeks[0]?.code ?? "unknown" };
    return { ok: true, seriesId: r.series_id ?? seriesIdOf(v.attemptId), booked: r.booked, weeks };
  } catch {
    return (await findSeries(v.attemptId).catch(() => null)) ?? { ok: "unknown" };
  }
}

export async function checkSeries(attemptId: string): Promise<SeriesResult> {
  if (!uuid.safeParse(attemptId).success) return { ok: "unknown" };
  return (await findSeries(attemptId)) ?? { ok: "unknown" };
}

// ------------------------------------------------------------ waitlist
export async function joinWaitlist(input: {
  studentId: string;
  serviceId: string;
  instructorId: string | null;
  day: string;
  from: string | null;
  to: string | null;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const time = z.string().regex(/^\d{2}:\d{2}$/).nullable();
  const parsed = z
    .object({ studentId: uuid, serviceId: uuid, instructorId: uuid.nullable(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), from: time, to: time })
    .safeParse(input);
  if (!parsed.success) return { ok: false, code: "unknown" };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_student: v.studentId,
    p_service: v.serviceId,
    p_instructor: v.instructorId,
    p_day: v.day,
    p_from: v.from,
    p_to: v.to,
  });
  if (error) return { ok: false, code: "unknown" };
  const r = data as { ok?: boolean; error?: string };
  revalidatePath("/lessons");
  return r.ok ? { ok: true } : { ok: false, code: r.error ?? "unknown" };
}
