"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { backPath, flash, rpcOutcome, str } from "./_lib/util";

const uuid = z.string().uuid();

function touch() {
  revalidatePath("/admin", "layout");
  // booking changes queue notifications + emails in the DB (trigger); pg_cron sends them within a minute
}

/** Approve every pending lesson of a weekly series at once (one summary notification to the family). */
export async function approveSeries(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/requests");
  const series = uuid.safeParse(fd.get("series"));
  if (!series.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const res = await supabase.rpc("approve_series", { p_series: series.data });
  touch();
  rpcOutcome(back, res, "approved");
}

export async function adminLeaveWaitlist(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/requests");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const res = await supabase.rpc("leave_waitlist", { p_id: id.data });
  touch();
  rpcOutcome(back, res, "deleted");
}

export async function setStatus(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/requests");
  const id = uuid.safeParse(fd.get("id"));
  const status = z.enum(["approved", "declined", "completed", "no_show"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) flash(back, "err", "unknown");
  const note = str(fd, "note");
  const supabase = await createClient();
  const res = await supabase.rpc("set_booking_status", {
    p_booking: id.data,
    p_status: status.data,
    p_note: note || null,
    p_report: null,
  });
  touch();
  rpcOutcome(back, res, status.data);
}

export async function setPaid(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/payments");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const res = await supabase.rpc("set_booking_paid", { p_booking: id.data, p_paid: fd.get("paid") === "true" });
  touch();
  rpcOutcome(back, res, "paid");
}

export async function cancelBooking(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/calendar");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const res = await supabase.rpc("cancel_booking", { p_booking: id.data, p_reason: str(fd, "reason").slice(0, 300) });
  touch();
  rpcOutcome(back, res, "cancelled");
}

export async function saveNotes(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/calendar");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({
      staff_note: str(fd, "staff_note").slice(0, 2000),
      lesson_report: str(fd, "lesson_report").slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id.data);
  touch();
  if (error) flash(back, "err", "unknown");
  flash(back, "ok", "saved");
}

export type Slot = { starts_at: string; instructor_id: string; instructor_name: string; spots_left: number };

/** Called from the client new-lesson form. Admin sees all future slots (no notice/horizon limits). */
export async function loadSlots(service: string, day: string, instructor: string | null): Promise<Slot[]> {
  await requireRole("admin");
  if (!uuid.safeParse(service).success || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_available_slots", {
    p_service: service,
    p_day: day,
    p_instructor: instructor && uuid.safeParse(instructor).success ? instructor : null,
  });
  return (data as Slot[]) ?? [];
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export async function createBooking(input: {
  attempt: string;
  student: string;
  service: string;
  instructor: string;
  start: string;
  payment: string;
  note: string;
}): Promise<CreateResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      attempt: uuid,
      student: uuid,
      service: uuid,
      instructor: uuid,
      start: z.string().datetime({ offset: true }),
      payment: z.enum(["cash", "bit", "paybox", "card"]),
      note: z.string().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "unknown" };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_booking", {
    p_attempt: p.attempt,
    p_student: p.student,
    p_service: p.service,
    p_instructor: p.instructor,
    p_start: p.start,
    p_payment: p.payment,
    p_note: p.note,
  });
  if (error) return { ok: false, error: "unknown" };
  const d = data as { ok?: boolean; error?: string; booking_id?: string };
  if (!d.ok || !d.booking_id) return { ok: false, error: d.error ?? "unknown" };
  touch();
  return { ok: true, id: d.booking_id };
}
