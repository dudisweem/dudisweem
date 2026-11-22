"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProgState = { error?: string; ok?: string } | null;

const ERR: Record<string, string> = {
  not_found: "אפשר לעדכן התקדמות רק לחניכים שלימדת.",
  invalid: "בחרו מיומנות וסטטוס.",
};

export async function recordProgress(_: ProgState, fd: FormData): Promise<ProgState> {
  await requireRole("instructor", "admin");
  const parsed = z
    .object({
      student: z.string().uuid(),
      skill: z.string().uuid(),
      status: z.enum(["not_started", "practicing", "achieved"]),
      note: z.string().trim().max(500),
    })
    .safeParse({ student: fd.get("student"), skill: fd.get("skill"), status: fd.get("status"), note: fd.get("note") ?? "" });
  if (!parsed.success) return { error: ERR.invalid };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_progress", {
    p_student: parsed.data.student,
    p_skill: parsed.data.skill,
    p_status: parsed.data.status,
    p_note: parsed.data.note,
  });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) return { error: ERR[r?.error ?? ""] ?? "משהו השתבש. נסו שוב." };
  revalidatePath("/workday");
  revalidatePath("/admin/students", "layout");
  return { ok: "ההתקדמות נשמרה" };
}
