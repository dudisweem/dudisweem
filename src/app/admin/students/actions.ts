"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { backPath, bool, flash, str } from "../_lib/util";
import { localToUtc } from "@/domain/format";

const uuid = z.string().uuid();

export async function addCredit(fd: FormData) {
  const me = await requireRole("admin");
  const back = backPath(fd, "/admin/students");
  const student = uuid.safeParse(fd.get("student"));
  const pkg = uuid.safeParse(fd.get("package"));
  if (!student.success || !pkg.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  const { data: p } = await supabase.from("packages").select("id, service_id, lessons, validity_days").eq("id", pkg.data).single();
  if (!p) flash(back, "err", "not_found");
  const expires = new Date(Date.now() + p.validity_days * 86_400_000).toISOString();
  const { error } = await supabase.from("credits").insert({
    student_id: student.data,
    package_id: p.id,
    service_id: p.service_id,
    lessons_total: p.lessons,
    expires_at: expires,
    paid: bool(fd, "paid"),
    note: str(fd, "note").slice(0, 300),
    created_by: me.id,
  });
  revalidatePath(back);
  if (error) flash(back, "err", "unknown");
  flash(back, "ok", "created");
}

export async function updateCredit(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/students");
  const id = uuid.safeParse(fd.get("id"));
  const parsed = z
    .object({ total: z.coerce.number().int().min(1).max(200), used: z.coerce.number().int().min(0).max(200) })
    .refine((v) => v.used <= v.total)
    .safeParse({ total: fd.get("total"), used: fd.get("used") });
  if (!id.success || !parsed.success) flash(back, "err", "unknown");
  const expires = str(fd, "expires");
  const supabase = await createClient();
  const { error } = await supabase
    .from("credits")
    .update({
      lessons_total: parsed.data.total,
      lessons_used: parsed.data.used,
      paid: bool(fd, "paid"),
      expires_at: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? localToUtc(expires, "23:59").toISOString() : null,
    })
    .eq("id", id.data);
  revalidatePath(back);
  if (error) flash(back, "err", "unknown");
  flash(back, "ok", "saved");
}

export async function deleteCredit(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/students");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const supabase = await createClient();
  // bookings referencing this credit keep their row; unlink first
  await supabase.from("bookings").update({ credit_id: null }).eq("credit_id", id.data);
  const { error } = await supabase.from("credits").delete().eq("id", id.data);
  revalidatePath(back);
  if (error) flash(back, "err", "unknown");
  flash(back, "ok", "deleted");
}

export async function updateStudentAdmin(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/students");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "unknown");
  const level = z.enum(["none", "beginner", "basic", "intermediate", "advanced"]).safeParse(fd.get("swim_level"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      swim_level: level.success ? level.data : "beginner",
      notes: str(fd, "notes").slice(0, 2000),
      active: bool(fd, "active"),
    })
    .eq("id", id.data);
  revalidatePath(back);
  if (error) flash(back, "err", "unknown");
  flash(back, "ok", "saved");
}
