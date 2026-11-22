"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { backPath, flash, rpcOutcome, str } from "../_lib/util";

const uuid = z.string().uuid();

export async function setRole(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/users");
  const id = uuid.safeParse(fd.get("id"));
  const role = z.enum(["admin", "instructor", "parent"]).safeParse(fd.get("role"));
  if (!id.success || !role.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const res = await supabase.rpc("admin_set_role", { p_user: id.data, p_role: role.data });
  revalidatePath("/admin", "layout");
  rpcOutcome(back, res, "role");
}

export async function setActive(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/users");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash(back, "err", "invalid");
  const supabase = await createClient();
  const res = await supabase.rpc("admin_set_active", { p_user: id.data, p_active: fd.get("active") === "true" });
  revalidatePath("/admin", "layout");
  rpcOutcome(back, res, "active");
}

export async function updateUser(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/users");
  const id = uuid.safeParse(fd.get("id"));
  const color = str(fd, "color");
  if (!id.success || (color && !/^#[0-9a-fA-F]{6}$/.test(color))) flash(back, "err", "invalid");
  const supabase = await createClient();
  const res = await supabase.rpc("admin_update_profile", {
    p_user: id.data,
    p_full_name: str(fd, "full_name").slice(0, 120),
    p_phone: str(fd, "phone").slice(0, 30),
    p_color: color,
  });
  revalidatePath("/admin", "layout");
  rpcOutcome(back, res, "saved");
}
