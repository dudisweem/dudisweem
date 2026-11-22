"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseShekel } from "@/domain/format";
import { bool, flash, str } from "../_lib/util";

const back = "/admin/services";

function parseService(fd: FormData) {
  const price = parseShekel(str(fd, "price"));
  const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(99).nullable());
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().max(500),
      duration_min: z.coerce.number().int().min(10).max(240),
      capacity: z.coerce.number().int().min(1).max(30),
      min_age: optInt,
      max_age: optInt,
      sort: z.coerce.number().int().min(0).max(999),
    })
    .safeParse({
      name: fd.get("name"),
      description: str(fd, "description"),
      duration_min: fd.get("duration_min"),
      capacity: fd.get("capacity"),
      min_age: fd.get("min_age"),
      max_age: fd.get("max_age"),
      sort: fd.get("sort") || 0,
    });
  if (!parsed.success || price === null) return null;
  if (parsed.data.min_age != null && parsed.data.max_age != null && parsed.data.min_age > parsed.data.max_age) return null;
  return {
    ...parsed.data,
    price_agorot: price,
    active: bool(fd, "active"),
    bookable_by_parents: bool(fd, "bookable_by_parents"),
  };
}

export async function createService(fd: FormData) {
  await requireRole("admin");
  const row = parseService(fd);
  if (!row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("services").insert(row);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "created");
}

export async function updateService(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  const row = parseService(fd);
  if (!id.success || !row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("services").update(row).eq("id", id.data);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}

export async function deleteService(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id.data);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", error.code === "23503" ? "in_use" : "invalid");
  flash(back, "ok", "deleted");
}
