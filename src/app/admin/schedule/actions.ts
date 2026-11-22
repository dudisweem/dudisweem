"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localToUtc, addDays } from "@/domain/format";
import { backPath, flash, str } from "../_lib/util";

const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function addHours(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/schedule");
  const instructor = uuid.safeParse(fd.get("instructor"));
  const start = hhmm.safeParse(fd.get("start"));
  const end = hhmm.safeParse(fd.get("end"));
  const days = fd.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!instructor.success || !start.success || !end.success || days.length === 0) flash(back, "err", "invalid");
  if (end.data <= start.data) flash(back, "err", "time_order");
  const supabase = await createClient();
  const { error } = await supabase
    .from("working_hours")
    .insert(days.map((weekday) => ({ instructor_id: instructor.data, weekday, start_time: start.data, end_time: end.data })));
  revalidatePath("/admin", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}

export async function removeHours(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/schedule");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("working_hours").delete().eq("id", id.data);
  revalidatePath("/admin", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "deleted");
}

export async function addTimeOff(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/schedule");
  const who = str(fd, "who");
  const instructor = who === "all" ? null : uuid.safeParse(who).success ? who : undefined;
  const fromDay = day.safeParse(fd.get("from_day"));
  const toDay = day.safeParse(fd.get("to_day") || fd.get("from_day"));
  const allDay = fd.get("all_day") === "on";
  const fromT = allDay ? "00:00" : str(fd, "from_time") || "00:00";
  const toT = allDay ? null : str(fd, "to_time");
  if (instructor === undefined || !fromDay.success || !toDay.success || !hhmm.safeParse(fromT).success || (toT && !hhmm.safeParse(toT).success)) {
    flash(back, "err", "invalid");
  }
  const startsAt = localToUtc(fromDay.data, fromT);
  const endsAt = toT ? localToUtc(toDay.data, toT) : localToUtc(addDays(toDay.data, 1), "00:00");
  if (endsAt <= startsAt) flash(back, "err", "time_order");
  const supabase = await createClient();
  const { error } = await supabase.from("time_off").insert({
    instructor_id: instructor,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: str(fd, "reason").slice(0, 120),
  });
  revalidatePath("/admin", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}

export async function removeTimeOff(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/schedule");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("time_off").delete().eq("id", id.data);
  revalidatePath("/admin", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "deleted");
}
