"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bool, flash, str } from "../_lib/util";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export async function saveSettings(fd: FormData) {
  await requireRole("admin");
  const back = "/admin/settings";
  const nums = z
    .object({
      cancellation_hours: int(0, 168),
      min_notice_hours: int(0, 168),
      booking_horizon_days: int(1, 365),
      slot_step_min: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 45, 60].includes(v)),
      buffer_min: int(0, 60),
      max_lessons_per_week_per_student: int(0, 14),
      health_validity_months: int(1, 60),
    })
    .safeParse(Object.fromEntries(fd));
  if (!nums.success) flash(back, "err", "invalid");

  const business_name = str(fd, "business_name");
  if (!business_name) flash(back, "err", "invalid");
  const paybox = str(fd, "paybox_link");
  if (paybox && !/^https:\/\//.test(paybox)) flash(back, "err", "invalid");
  const bitLink = str(fd, "bit_link");
  if (bitLink && !/^https:\/\//.test(bitLink)) flash(back, "err", "invalid");

  const update = {
    ...nums.data,
    business_name: business_name.slice(0, 80),
    tagline: str(fd, "tagline").slice(0, 160),
    welcome_text: str(fd, "welcome_text").slice(0, 2000),
    contact_phone: str(fd, "contact_phone").slice(0, 30),
    contact_email: str(fd, "contact_email").slice(0, 120),
    address: str(fd, "address").slice(0, 200),
    booking_open: bool(fd, "booking_open"),
    closed_message: str(fd, "closed_message").slice(0, 300),
    require_approval: bool(fd, "require_approval"),
    instructor_availability_approval: bool(fd, "instructor_availability_approval"),
    health_required: bool(fd, "health_required"),
    payment_cash: bool(fd, "payment_cash"),
    payment_bit: bool(fd, "payment_bit"),
    payment_paybox: bool(fd, "payment_paybox"),
    payment_card: bool(fd, "payment_card"),
    email_admin_new_request: bool(fd, "email_admin_new_request"),
    email_parent_status: bool(fd, "email_parent_status"),
    email_reminders: bool(fd, "email_reminders"),
    email_waitlist: bool(fd, "email_waitlist"),
    bit_phone: str(fd, "bit_phone").slice(0, 30),
    paybox_link: paybox.slice(0, 300),
    bit_link: bitLink.slice(0, 300),
    updated_at: new Date().toISOString(),
  };
  if (!update.payment_cash && !update.payment_bit && !update.payment_paybox && !update.payment_card) {
    flash(back, "err", "no_payment");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(update).eq("id", 1);
  revalidatePath("/", "layout");
  if (error) flash(back, "err", "invalid");
  flash(back, "ok", "saved");
}
