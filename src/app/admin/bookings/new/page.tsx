import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { businessDay } from "@/domain/format";
import { NewBookingForm } from "./NewBookingForm";

export const metadata: Metadata = { title: "שיעור חדש" };

export default async function NewBooking({ searchParams }: PageProps<"/admin/bookings/new">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();
  const [studentsRes, servicesRes, staffRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name, parent:profiles!students_parent_id_fkey ( full_name )")
      .eq("active", true)
      .order("first_name"),
    supabase.from("services").select("id, name, duration_min, capacity").eq("active", true).order("sort"),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "instructor"]).eq("active", true).order("full_name"),
  ]);
  const students = (studentsRes.data ?? []).map((s) => {
    const parent = s.parent as unknown as { full_name: string } | null;
    return { id: s.id as string, name: `${s.first_name} ${s.last_name}`.trim(), parent: parent?.full_name ?? "" };
  });
  const payments = (["cash", "bit", "paybox", "card"] as const).filter((p) => settings[`payment_${p}`]);

  return (
    <Shell roles={["admin"]} head={<Head kicker="קביעה ידנית, מאושר מיד" title="שיעור חדש" />}>
      <NewBookingForm
        students={students}
        services={servicesRes.data ?? []}
        staff={staffRes.data ?? []}
        payments={payments}
        today={businessDay()}
        initialStudent={typeof sp.student === "string" ? sp.student : ""}
      />
    </Shell>
  );
}
