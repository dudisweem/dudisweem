"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash, str } from "../_lib/util";

const BACK = "/admin/skills";
const uuid = z.string().uuid();
const fields = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  sort: z.coerce.number().int().min(0).max(10000),
});

export async function addSkill(fd: FormData) {
  await requireRole("admin");
  const parsed = fields.safeParse({ name: str(fd, "name"), category: str(fd, "category"), sort: fd.get("sort") || 0 });
  if (!parsed.success) flash(BACK, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("skills").insert(parsed.data);
  revalidatePath(BACK);
  if (error) flash(BACK, "err", "invalid");
  flash(BACK, "ok", "created");
}

export async function updateSkill(fd: FormData) {
  await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  const parsed = fields.safeParse({ name: str(fd, "name"), category: str(fd, "category"), sort: fd.get("sort") || 0 });
  if (!id.success || !parsed.success) flash(BACK, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("skills")
    .update({ ...parsed.data, active: fd.get("active") === "on" })
    .eq("id", id.data);
  revalidatePath(BACK);
  if (error) flash(BACK, "err", "invalid");
  flash(BACK, "ok", "saved");
}

/** Deleting removes the skill's history too, so it is only allowed while no progress was recorded. */
export async function deleteSkill(fd: FormData) {
  await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(BACK, "err", "invalid");
  const supabase = await createClient();
  const { count } = await supabase.from("student_progress").select("id", { count: "exact", head: true }).eq("skill_id", id.data);
  if (count) flash(BACK, "err", "skill_in_use");
  const { error } = await supabase.from("skills").delete().eq("id", id.data);
  revalidatePath(BACK);
  if (error) flash(BACK, "err", "invalid");
  flash(BACK, "ok", "deleted");
}
