"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createMailerClient } from "@/lib/supabase/implicit";
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

export async function deleteUser(fd: FormData) {
  await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) flash("/admin/users", "err", "invalid");
  const supabase = await createClient();
  const res = await supabase.rpc("admin_delete_user", { p_user: id.data });
  revalidatePath("/admin", "layout");
  // the user's row is gone, so return to the plain list
  rpcOutcome("/admin/users", res, "user_deleted");
}

/** Emails the user a password-reset link (implicit flow: opens from any browser/app). */
export async function sendResetLink(fd: FormData) {
  await requireRole("admin");
  const back = backPath(fd, "/admin/users");
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) flash(back, "err", "invalid");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "sea-d-change.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const { error } = await createMailerClient().auth.resetPasswordForEmail(email.data, { redirectTo: `${proto}://${host}/auth/hash` });
  if (error) flash(back, "err", error.code === "over_email_send_rate_limit" ? "rate_limited" : "unknown");
  flash(back, "ok", "reset_sent");
}
