"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorText } from "@/domain/labels";

type State = { error?: string; ok?: string } | null;
const uuid = z.string().uuid();

/** Cancel this lesson and every later one in the series; each keeps its own cancellation rule. */
export async function cancelSeriesRest(_: State, fd: FormData): Promise<State> {
  const series = uuid.safeParse(fd.get("series"));
  const from = z.string().datetime({ offset: true }).safeParse(fd.get("from"));
  if (!series.success || !from.success) return { error: errorText("not_found") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_series", { p_series: series.data, p_from: from.data });
  const r = data as { ok?: boolean; error?: string; cancelled?: number; blocked?: number } | null;
  if (error || !r?.ok) return { error: errorText(r?.error ?? (r?.blocked ? "too_late_to_cancel" : "unknown")) };
  revalidatePath("/lessons");
  revalidatePath("/home");
  return {
    ok: r.blocked
      ? `בוטלו ${r.cancelled} שיעורים. ${r.blocked} לא בוטלו כי הם קרובים מדי — לביטולם צרו קשר עם בית הספר.`
      : `בוטלו ${r.cancelled} שיעורים בסדרה.`,
  };
}

export async function leaveWaitlist(_: State, fd: FormData): Promise<State> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: errorText("not_found") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_waitlist", { p_id: id.data });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) return { error: errorText(r?.error ?? "unknown") };
  revalidatePath("/lessons");
  return { ok: "יצאתם מרשימת ההמתנה." };
}
