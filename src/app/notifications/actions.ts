"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ALL = ["parent", "instructor", "admin"] as const;

/** Mark one notification read and open its link (same-site paths only). */
export async function openNotification(fd: FormData) {
  const me = await requireRole(...ALL);
  const id = z.string().uuid().safeParse(fd.get("id"));
  const link = fd.get("link");
  const target = typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : "/notifications";
  if (id.success) {
    const supabase = await createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", me.id).is("read_at", null);
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function markAllRead() {
  const me = await requireRole(...ALL);
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null);
  revalidatePath("/", "layout");
}
