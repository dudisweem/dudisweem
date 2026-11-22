"use server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessDay } from "@/domain/format";

export type PoolRow = {
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  instructor_id: string;
  instructor_name: string;
  instructor_color: string;
  kid_label: string;
  kid_color: string;
};

export async function loadPool(): Promise<{ rows: PoolRow[]; at: string } | { error: true }> {
  await requireRole("admin", "instructor");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pool_board", { p_day: businessDay() });
  if (error) return { error: true };
  return { rows: (data ?? []) as PoolRow[], at: new Date().toISOString() };
}
