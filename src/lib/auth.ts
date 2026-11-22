import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/domain/labels";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: Role;
  is_owner: boolean;
  active: boolean;
  color: string;
};

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
  return (data as Profile) ?? null;
});

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "instructor" ? "/workday" : "/home";
}

export async function requireRole(...roles: Role[]): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  if (!p.active) redirect("/login?state=inactive");
  if (!roles.includes(p.role)) redirect(homeFor(p.role));
  return p;
}

export const getSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
  return data as Settings;
});

export type Settings = {
  business_name: string;
  tagline: string;
  welcome_text: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  cancellation_hours: number;
  min_notice_hours: number;
  booking_horizon_days: number;
  slot_step_min: number;
  buffer_min: number;
  require_approval: boolean;
  max_lessons_per_week_per_student: number;
  health_required: boolean;
  health_validity_months: number;
  payment_cash: boolean;
  payment_bit: boolean;
  payment_paybox: boolean;
  payment_card: boolean;
  bit_phone: string;
  paybox_link: string;
  bit_link: string;
  booking_open: boolean;
  closed_message: string;
};
