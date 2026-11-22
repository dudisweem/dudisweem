"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, localToUtc } from "@/domain/format";

const BACK = "/workday/availability";
const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function done(kind: "ok" | "err", value: string): never {
  redirect(`${BACK}?${kind}=${encodeURIComponent(value)}`);
}

async function send(kind: string, payload: Record<string, unknown>): Promise<never> {
  await requireRole("instructor", "admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_availability_change", { p_kind: kind, p_payload: payload });
  const r = data as { ok?: boolean; applied?: boolean; error?: string } | null;
  revalidatePath("/workday", "layout");
  revalidatePath("/admin/schedule");
  if (error || !r?.ok) done("err", r?.error ?? "unknown");
  done("ok", r.applied ? "applied" : "requested");
}

export async function addMyHours(fd: FormData) {
  const start = hhmm.safeParse(fd.get("start"));
  const end = hhmm.safeParse(fd.get("end"));
  const weekdays = fd.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (!start.success || !end.success || weekdays.length === 0) done("err", "invalid");
  if (end.data <= start.data) done("err", "time_order");
  await send("add_hours", { weekdays, start: start.data, end: end.data });
}

export async function removeMyHours(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) done("err", "invalid");
  await send("remove_hours", { id: id.data });
}

export async function addMyTimeOff(fd: FormData) {
  const from = day.safeParse(fd.get("from_day"));
  const to = day.safeParse(fd.get("to_day") || fd.get("from_day"));
  const allDay = fd.get("all_day") === "on";
  const fromT = allDay ? "00:00" : String(fd.get("from_time") || "00:00");
  const toT = allDay ? null : String(fd.get("to_time") || "");
  if (!from.success || !to.success || !hhmm.safeParse(fromT).success || (toT && !hhmm.safeParse(toT).success)) done("err", "invalid");
  const startsAt = localToUtc(from.data, fromT);
  const endsAt = toT ? localToUtc(to.data, toT) : localToUtc(addDays(to.data, 1), "00:00");
  if (endsAt <= startsAt) done("err", "time_order");
  await send("add_time_off", {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: String(fd.get("reason") ?? "").trim().slice(0, 120),
  });
}

export async function removeMyTimeOff(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) done("err", "invalid");
  await send("remove_time_off", { id: id.data });
}

export async function cancelMyRequest(fd: FormData) {
  await requireRole("instructor", "admin");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) done("err", "invalid");
  const supabase = await createClient();
  const { data } = await supabase.rpc("cancel_availability_request", { p_request: id.data });
  revalidatePath(BACK);
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) done("err", r?.error ?? "unknown");
  done("ok", "cancelled");
}
