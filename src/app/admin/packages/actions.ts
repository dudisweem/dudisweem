"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseShekel } from "@/domain/format";
import { bool, flash, str } from "../_lib/util";

const back = "/admin/packages";

function parse(fd: FormData) {
  const price = parseShekel(str(fd, "price"));
  const service = str(fd, "service_id");
  const p = z
    .object({
      name: z.string().trim().min(2).max(80),
      lessons: z.coerce.number().int().min(1).max(100),
      validity_days: z.coerce.number().int().min(1).max(1095),
    })
    .safeParse({ name: fd.get("name"), lessons: fd.get("lessons"), validity_days: fd.get("validity_days") });
  if (!p.success || price === null) return null;
  if (service && !z.string().uuid().safeParse(service).success) return null;
  return { ...p.data, price_agorot: price, service_id: service || null, active: bool(fd, "active") };
}

export async function createPackage(fd: FormData) {
  await requireRole("admin");
  const row = parse(fd);
  if (!row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("packages").insert(row);
  revalidatePath(back);
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "created");
}

export async function updatePackage(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  const row = parse(fd);
  if (!id.success || !row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("packages").update(row).eq("id", id.data);
  revalidatePath(back);
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}

export async function deletePackage(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  // existing credits keep working (package_id → null)
  const { error } = await supabase.from("packages").delete().eq("id", id.data);
  revalidatePath(back);
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "deleted");
}
