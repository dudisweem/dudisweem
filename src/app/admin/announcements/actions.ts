"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bool, flash, str } from "../_lib/util";

const back = "/admin/announcements";

function parse(fd: FormData) {
  const title = str(fd, "title");
  if (title.length < 2 || title.length > 120) return null;
  return { title, body: str(fd, "body").slice(0, 2000), active: bool(fd, "active") };
}

export async function createAnnouncement(fd: FormData) {
  await requireRole("admin");
  const row = parse(fd);
  if (!row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert(row);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "created");
}

export async function updateAnnouncement(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  const row = parse(fd);
  if (!id.success || !row) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").update(row).eq("id", id.data);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}

export async function deleteAnnouncement(fd: FormData) {
  await requireRole("admin");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id.data);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "deleted");
}
