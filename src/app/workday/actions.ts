"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorText } from "@/domain/labels";

export type WState = { error?: string; ok?: string } | null;

export async function reportLesson(_: WState, fd: FormData): Promise<WState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(["completed", "no_show"]),
      report: z.string().trim().max(2000),
    })
    .safeParse({ id: fd.get("id"), status: fd.get("status"), report: fd.get("report") ?? "" });
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_booking_status", {
    p_booking: parsed.data.id,
    p_status: parsed.data.status,
    p_note: null,
    p_report: parsed.data.report,
  });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) return { error: errorText(r?.error) };
  revalidatePath("/workday");
  return { ok: parsed.data.status === "completed" ? "נשמר · השיעור התקיים" : "נשמר · לא הגיע" };
}
